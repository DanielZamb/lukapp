package expo.modules.notificationintake


internal object GenericNotificationParser {
  private val security = Regex("""\b(otp|token|code|one[\s\p{Z}-]*time[\s\p{Z}-]*code|pin|password|passcode|verification|verify|security|authentication|authenticate|login|sign[ -]?in|clave|codigo|contrasena|seguridad|verificacion|autenticacion|ingreso a|iniciar sesion)\b""")
  private val incoming = Regex("\\b(recibiste|recibido|recibida|recibio|abono|deposito|received|deposit|credited|refund|reembolso)\\b")
  private val outgoing = Regex("\\b(compra|compraste|pago|pagaste|retiro|debito|purchase|paid|payment|withdrawal|sent|enviaste)\\b")

  /** Broad: any security-ish word. Used only to keep such words out of merchant names. */
  fun hasSecurityContent(text: String) = security.containsMatchIn(NotificationText.fold(text))

  // Narrow: what gets a notification discarded before storage. A security word
  // near a standalone code, or a code right after "token"/"code"/"clave"/"OTP".
  // Bank footers ("Por su seguridad no comparta sus claves") and purchase
  // authorization numbers are not codes.
  private val codeWord = Regex("""(?<![\p{L}\p{N}])(otp|token|codigo|code|clave|contrasena|password|passcode|pin|verificacion|verification|one\s*-?\s*time\s*-?\s*code)(?![\p{L}\p{N}])""")
  private val standaloneCode = Regex("""(?<![\p{L}\p{N}$*.,/:\-])(?:[0-9]{4,8}|(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,10})(?![\p{L}\p{N}/:\-]|[.,][0-9])""")
  private val codeRightAfter = Regex("""^(?:[\p{Zs}\t]+(?:es|is))?[\p{Zs}\t:]+(?:[0-9]{4,10}|[A-Z0-9]{4,10})(?![\p{L}\p{N}])""")
  // Card and account endings ("terminada en 4321") are numbers, not codes.
  private val accountLead = Regex("""(termina\w*|ending|tarjeta|cuenta|card|account|cta|no\.)[\p{Zs}\t:]*(?:en|in)?[\p{Zs}\t:]*$""")
  private val notASecret = Regex("""autoriza|aprobac|referencia|comprobante|transacc|factura|convenio|authoriz|approval|reference|receipt""")

  /** Lowercase without accents, one character for one character, so offsets match the input. */
  private fun foldInPlace(value: String) = String(CharArray(value.length) { index ->
    java.text.Normalizer.normalize(value[index].toString(), java.text.Normalizer.Form.NFD)[0].lowercaseChar()
  })

  fun isSecurityCode(text: String): Boolean {
    val normalized = NotificationText.normalize(text)
    val folded = foldInPlace(normalized)
    val codes = standaloneCode.findAll(normalized).filter { code ->
      !accountLead.containsMatchIn(folded.substring(maxOf(0, code.range.first - 24), code.range.first))
    }.toList()
    for (word in codeWord.findAll(folded)) {
      if (codeRightAfter.containsMatchIn(normalized.substring(word.range.last + 1))) return true
      for (code in codes) {
        val from = minOf(word.range.first, code.range.first); val to = maxOf(word.range.last, code.range.last)
        if (to - from <= 48 && !notASecret.containsMatchIn(folded.substring(from, to + 1))) return true
      }
    }
    return false
  }

  fun parseFields(fields: NotificationFields): ParseResult {
    val inspected = NotificationText.inspected(fields)
    if (inspected.any { isSecurityCode(it) }) return ParseResult.Discard("security")
    if (inspected.any { it.length > 16_384 }) return ParseResult.Accepted(ParsedAmount(null, null, null), listOf("parse_input_too_large"))
    return parse(NotificationText.assemble(fields))
  }

  fun parse(text: String): ParseResult {
    if (isSecurityCode(text)) return ParseResult.Discard("security")
    if (text.length > 16_384) return ParseResult.Accepted(ParsedAmount(null, null, null), listOf("parse_input_too_large"))
    val normalized = NotificationText.normalize(text)
    val money = MonetaryGrammar.read(normalized)
    val folded = NotificationText.fold(normalized)
    val hasIn = incoming.containsMatchIn(folded)
    val hasOut = outgoing.containsMatchIn(folded)
    val direction = if (hasIn == hasOut) null else if (hasIn) "in" else "out"
    val found = money as? MonetaryResult.Found
    val reasons = when (money) {
      MonetaryResult.Missing -> listOf("no_amount")
      MonetaryResult.Multiple -> listOf("multiple_amounts")
      MonetaryResult.Invalid -> listOf("ambiguous")
      is MonetaryResult.Found -> emptyList()
    }
    return ParseResult.Accepted(ParsedAmount(direction, found?.minor, found?.currency, merchant(normalized, found?.end)), reasons)
  }

  private val merchantLabel = Regex("""(?i)\b(?:merchant|comercio|establecimiento)[\p{Zs}\t]*[:=][\p{Zs}\t]*""")
  private val merchantClause = Regex("""(?i)\b(?:at|en)[\p{Zs}\t]+""")
  private val privacy = Regex("""(?i)\b(account|acct|cuenta|card|tarjeta|iban|cvv|cvc)\b|(?:[\p{N}][\p{Zs}\t.\-]*){4,}|(?:[*xX#][\p{Zs}\t\-]*){2,}[\p{N}]""")
  private val narrative = Regex("""(?i)\b(transaction|transaccion|purchase|compra|payment|pago|balance|saldo|approved|aprobado|successful|received|recibido|sent|enviado|thanks|gracias)\b""")

  private fun safeMerchant(value: String): String {
    val normalized = NotificationText.singleLine(value)
    if (normalized.isEmpty() || normalized.toByteArray(Charsets.UTF_8).size > 256 || !normalized.any { it.isLetter() }) return ""
    if (hasSecurityContent(normalized) || MonetaryGrammar.hasMerchantMoney(normalized) ||
      privacy.containsMatchIn(normalized) || narrative.containsMatchIn(normalized) ||
      incoming.containsMatchIn(normalized.lowercase()) || outgoing.containsMatchIn(normalized.lowercase())) return ""
    if (!Regex("""[\p{L}\p{M}\p{N} &.'’#()\-]+""").matches(normalized)) return ""
    return normalized
  }

  private fun merchant(text: String, afterAmount: Int?): String {
    val candidates = mutableListOf<String>()
    fun values(region: String, markers: List<MatchResult>) {
      markers.forEachIndexed { index, marker ->
        val start = marker.range.last + 1
        val next = markers.getOrNull(index + 1)?.range?.first ?: region.length
        val end = (start until next).firstOrNull { region[it] in "\r\n;|" } ?: next
        candidates.add(safeMerchant(region.substring(start, end)))
      }
    }
    values(text, merchantLabel.findAll(text).toList())
    val tail = text.substring(afterAmount ?: text.length).trimStart { it.isWhitespace() || it in ";,.:!?|)]}" }
    val clauses = merchantClause.findAll(tail).toList()
    if (clauses.firstOrNull()?.range?.first == 0) values(tail, clauses)
    if (candidates.isEmpty() || candidates.any { it.isEmpty() }) return ""
    return candidates.distinctBy { it.lowercase() }.singleOrNull().orEmpty()
  }

  fun descriptionForSource(description: String, packageName: String, appLabel: String?): String {
    if (appLabel.isNullOrBlank()) return ""
    val merchant = safeMerchant(description)
    val value = NotificationText.compactIdentity(merchant)
    val identities = listOf(packageName, packageName.substringAfter('.'), appLabel).map { NotificationText.compactIdentity(it) }
    if (value.isEmpty() || identities.any { it.isNotEmpty() && value.contains(it) }) return ""
    return merchant
  }
}
