package expo.modules.notificationintake

import java.math.BigDecimal
import java.util.Locale

internal sealed interface MonetaryResult {
  data object Missing : MonetaryResult
  data object Multiple : MonetaryResult
  data object Invalid : MonetaryResult
  data class Found(val minor: Long, val currency: String?, val end: Int) : MonetaryResult
}

internal object MonetaryGrammar {
  private enum class Role { NUMBER, WORD, CURRENCY, SPACE, SOFT, HARD, SIGN, OPEN, CLOSE, OTHER }
  private data class Token(val role: Role, val text: String, val start: Int, val end: Int)
  private data class Label(val atoms: List<String>, val first: Int, val last: Int, val invalid: Boolean = false)
  private data class Side(val atoms: List<String>, val end: Int, val invalid: Boolean)
  private data class Envelope(val number: Token, val left: Side, val right: Side)
  private val supported = setOf("COP", "USD")
  private val pairs = mapOf('(' to ')', '[' to ']', '{' to '}')
  private val numeric = Regex("""[0-9]+(?:(?:[.,](?=[0-9])| (?=[0-9]))[0-9]+)*""")
  private val prosePrefix = setOf("paid", "purchase", "payment", "received", "deposit", "amount", "balance", "pagaste", "compra", "compraste", "pago", "recibiste", "deposito", "abono", "monto", "valor", "saldo", "at", "en")
  private val labels = setOf("merchant", "comercio", "establecimiento")
  private val currencies = java.util.Currency.getAvailableCurrencies()
  private val currencyCodes = currencies.map { it.currencyCode }.toSet() + setOf("USDT", "BTC", "ETH")
  private val currencyNames = currencies.flatMap { listOf(it.getDisplayName(Locale.ENGLISH), it.getDisplayName(Locale("es"))) }
    .map { NotificationText.fold(it).split(' ').filter { word -> word.isNotEmpty() } }.filter { it.isNotEmpty() }
  private val units = Regex("""(?:pesos?|euros?|dolar(?:es)?|dollars?|pounds?|yen|yuan|rupees?|cents?|centavos?|francs?|rubles?|rublos?|shillings?)""")

  private fun currency(char: Char) = Character.getType(char).toInt() == Character.CURRENCY_SYMBOL.toInt()
  private fun marker(atom: String) = atom.uppercase(Locale.ROOT) in supported || atom.any { currency(it) }

  private fun tokens(text: String): List<Token> {
    val result = mutableListOf<Token>()
    var index = 0
    while (index < text.length) {
      val first = index
      val char = text[index]
      val role = when {
        char in '0'..'9' -> Role.NUMBER
        char.isLetter() || char == '_' -> Role.WORD
        currency(char) -> Role.CURRENCY
        char == ' ' -> Role.SPACE
        char == ',' || char == ':' -> Role.SOFT
        char == '\n' || char in ";.!?|\"'" -> Role.HARD
        char in "+-−" -> Role.SIGN
        char in pairs.keys -> Role.OPEN
        char in pairs.values -> Role.CLOSE
        else -> Role.OTHER
      }
      when (role) {
        Role.NUMBER -> index = numeric.find(text, first)!!.range.last + 1
        Role.WORD -> { index++; while (index < text.length && (text[index].isLetter() || text[index] == '_')) index++ }
        Role.SPACE -> { index++; while (index < text.length && text[index] == ' ') index++ }
        else -> index++
      }
      result.add(Token(role, text.substring(first, index), first, index))
    }
    return result
  }

  private fun label(tokens: List<Token>, first: Int): Label? {
    val token = tokens.getOrNull(first) ?: return null
    if (token.role == Role.WORD || token.role == Role.CURRENCY) return Label(listOf(token.text), first, first)
    if (token.role != Role.OPEN) return null
    val atoms = mutableListOf<String>()
    var index = first + 1
    while (index < tokens.size) {
      val next = tokens[index]
      when (next.role) {
        Role.SPACE -> Unit
        Role.WORD, Role.CURRENCY -> atoms.add(next.text)
        Role.CLOSE -> return Label(atoms, first, index, next.text.single() != pairs[token.text.single()] || atoms.isEmpty())
        else -> return Label(atoms, first, index, true)
      }
      index++
    }
    return Label(atoms, first, tokens.lastIndex, true)
  }

  private fun adjacentLabel(tokens: List<Token>, index: Int, direction: Int): Label? {
    val token = tokens[index]
    if (direction > 0 || token.role != Role.CLOSE) return label(tokens, index)
    val opening = pairs.entries.first { it.value == token.text.single() }.key
    val first = (index - 1 downTo 0).firstOrNull { tokens[it].role == Role.OPEN && tokens[it].text.single() == opening }
      ?: return Label(emptyList(), index, index, true)
    val parsed = label(tokens, first) ?: return null
    return if (parsed.last == index) parsed else parsed.copy(invalid = true)
  }

  private fun side(tokens: List<Token>, number: Int, direction: Int): Side {
    val atoms = mutableListOf<String>()
    var index = number + direction
    var end = tokens[number].end
    var invalid = false
    var separated = false
    while (index in tokens.indices) {
      val token = tokens[index]
      when (token.role) {
        Role.SPACE, Role.SOFT -> { separated = true; index += direction; continue }
        Role.HARD -> {
          if (direction > 0 && token.text == "\n") {
            val next = tokens.drop(index + 1).firstOrNull { it.role != Role.SPACE && !(it.role == Role.HARD && it.text == "\n") }
            if (next?.role == Role.NUMBER) invalid = true
          }
          break
        }
        Role.SIGN -> { invalid = true; index += direction; continue }
        Role.NUMBER, Role.OTHER -> { atoms.add(token.text); break }
        else -> Unit
      }
      if (direction < 0 && token.role == Role.OPEN || direction > 0 && token.role == Role.CLOSE) {
        invalid = true; index += direction; continue
      }
      if (token.role == Role.WORD) {
        val word = NotificationText.fold(token.text)
        val explicitLabel = labels.contains(word) && tokens.drop(index + 1).firstOrNull { it.role != Role.SPACE }?.text == ":"
        if (separated && (direction < 0 && (word in prosePrefix || word in labels) || direction > 0 && (word in setOf("at", "en") || explicitLabel))) break
      }
      val parsed = adjacentLabel(tokens, index, direction)
      if (parsed == null) { invalid = true; break }
      atoms.addAll(parsed.atoms)
      invalid = invalid || parsed.invalid
      if (direction > 0) end = tokens[parsed.last].end
      if (parsed.invalid) break
      index = if (direction > 0) parsed.last + 1 else parsed.first - 1
      separated = false
    }
    return Side(atoms, end, invalid)
  }

  fun read(text: String): MonetaryResult {
    val tokens = tokens(text)
    val envelopes = tokens.indices.filter { tokens[it].role == Role.NUMBER }.map { index ->
      Envelope(tokens[index], side(tokens, index, -1), side(tokens, index, 1))
    }.filter { it.left.atoms.any { atom -> marker(atom) } || it.right.atoms.any { atom -> marker(atom) } }
    if (envelopes.isEmpty()) return MonetaryResult.Missing
    if (envelopes.any { it.left.invalid || it.right.invalid }) return MonetaryResult.Invalid
    if (envelopes.size > 1) return MonetaryResult.Multiple
    val envelope = envelopes.single()
    val annotations = envelope.left.atoms + envelope.right.atoms
    val codes = annotations.filter { it.uppercase(Locale.ROOT) in supported }.map { it.uppercase(Locale.ROOT) }.distinct()
    val dollars = annotations.count { it == "$" }
    if (annotations.any { it != "$" && it.uppercase(Locale.ROOT) !in supported } || codes.size > 1 || dollars > 1 || codes.isEmpty() && dollars != 1) return MonetaryResult.Invalid
    val decimal = decimal(envelope.number.text) ?: return MonetaryResult.Invalid
    val minor = try { BigDecimal(decimal).movePointRight(2).longValueExact() } catch (_: ArithmeticException) { return MonetaryResult.Invalid }
    if (minor !in 1..SAFE_INTEGER) return MonetaryResult.Invalid
    return MonetaryResult.Found(minor, codes.singleOrNull(), envelope.right.end)
  }

  private fun financialPhrase(tokens: List<Token>, first: Int): Boolean {
    val next = tokens.drop(first).dropWhile { it.role == Role.SPACE }
    val atom = next.firstOrNull() ?: return false
    if (atom.role == Role.CURRENCY) return true
    if (atom.role != Role.WORD) return false
    if (atom.text == atom.text.uppercase(Locale.ROOT) && atom.text in currencyCodes) return true
    if (units.matches(NotificationText.fold(atom.text))) return true
    return currencyNames.any { phrase ->
      var position = 0
      phrase.all { expected ->
        while (position < next.size && next[position].role == Role.SPACE) position++
        val observed = next.getOrNull(position++)
        observed?.role == Role.WORD && NotificationText.fold(observed.text).let { word ->
          expected in listOf(word, word.removeSuffix("s"), word.removeSuffix("es"))
        }
      }
    }
  }

  fun hasMerchantMoney(value: String): Boolean {
    val text = NotificationText.normalize(value)
    if (text.any { currency(it) } || Regex("""(?i)\b(?:COP|USD)\b""").containsMatchIn(text)) return true
    val tokens = tokens(text)
    return tokens.indices.filter { tokens[it].role == Role.NUMBER }.any { index ->
      val prior = tokens.take(index).lastOrNull { it.role != Role.SPACE }
      val prefixCode = prior?.role == Role.WORD && prior.text == prior.text.uppercase(Locale.ROOT) && prior.text in currencyCodes
      prefixCode || financialPhrase(tokens, index + 1)
    }
  }

  private fun decimal(value: String): String? {
    if (' ' in value) {
      if (!Regex("""[0-9]{1,3}( [0-9]{3})+([.,][0-9]{2})?""").matches(value)) return null
      return value.replace(" ", "").replace(',', '.')
    }
    if (Regex("""[0-9]+""").matches(value)) return value
    if (Regex("""[0-9]+[.,][0-9]{2}""").matches(value)) return value.replace(',', '.')
    if (Regex("""[0-9]{1,3}(,[0-9]{3})+\.[0-9]{2}""").matches(value)) return value.replace(",", "")
    if (Regex("""[0-9]{1,3}(\.[0-9]{3})+,[0-9]{2}""").matches(value)) return value.replace(".", "").replace(',', '.')
    return null
  }
}
