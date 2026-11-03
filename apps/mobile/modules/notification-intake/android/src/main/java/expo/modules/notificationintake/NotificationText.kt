package expo.modules.notificationintake

import java.text.Normalizer
import java.util.Locale

internal data class NotificationFields(
  val title: String? = null,
  val bigText: String? = null,
  val text: String? = null,
  val textLines: List<String> = emptyList(),
  val subText: String? = null,
)

/** Kept per candidate. 512 pending captures × 640 B stays inside the native state budget. */
internal const val TEXT_LIMIT_BYTES = 640
/** Disclosures under which the person agreed that notification text is kept. */
internal val TEXT_CONSENT_VERSIONS = setOf("notification-disclosure@3")
/** Earlier consent strings, used only to recognise replay digests written before text was kept. */
internal val LEGACY_CONSENT_VERSIONS = listOf("notification-disclosure@1", "notification-disclosure@2")

internal object NotificationText {
  fun normalize(value: String): String {
    val compatible = Normalizer.normalize(value, Normalizer.Form.NFKC).replace("\r\n", "\n").replace('\r', '\n')
    val result = StringBuilder()
    compatible.codePoints().forEach { code ->
      val digit = Character.digit(code, 10)
      when {
        digit in 0..9 -> result.append(('0'.code + digit).toChar())
        code == 10 || Character.getType(code) in listOf(Character.LINE_SEPARATOR.toInt(), Character.PARAGRAPH_SEPARATOR.toInt()) -> result.append('\n')
        Character.isWhitespace(code) || Character.isSpaceChar(code) -> result.append(' ')
        else -> result.appendCodePoint(code)
      }
    }
    return result.toString()
  }

  fun fold(value: String) = Normalizer.normalize(normalize(value).lowercase(Locale.ROOT), Normalizer.Form.NFD)
    .replace(Regex("""\p{M}+"""), "")

  fun compactIdentity(value: String) = fold(value).filter { it.isLetterOrDigit() }
  fun singleLine(value: String) = normalize(value).trim().replace(Regex("""\s+"""), " ")

  fun inspected(fields: NotificationFields) = listOfNotNull(fields.title, fields.bigText, fields.text, fields.subText) + fields.textLines

  /** What a candidate keeps of the notification: title and body, tidied, at most [limit] UTF-8 bytes. */
  fun retained(fields: NotificationFields, limit: Int = TEXT_LIMIT_BYTES): String {
    val lines = normalize(assemble(fields)).split('\n').map { it.trim().replace(Regex(" {2,}"), " ") }.filter { it.isNotEmpty() }
    return capUtf8(lines.joinToString("\n"), limit)
  }

  fun capUtf8(value: String, limit: Int): String {
    var bytes = 0
    val result = StringBuilder()
    for (code in value.codePoints().toArray()) {
      val size = when { code <= 0x7f -> 1; code <= 0x7ff -> 2; code <= 0xffff -> 3; else -> 4 }
      if (bytes + size > limit) break
      bytes += size; result.appendCodePoint(code)
    }
    return result.toString()
  }

  fun assemble(fields: NotificationFields): String {
    val body = listOfNotNull(fields.bigText, fields.text).firstOrNull { it.isNotBlank() }
      ?: fields.textLines.takeIf { it.isNotEmpty() }?.joinToString("\n")
      ?: fields.subText.orEmpty()
    return listOfNotNull(fields.title, body).filter { it.isNotBlank() }.joinToString("\n")
  }
}
