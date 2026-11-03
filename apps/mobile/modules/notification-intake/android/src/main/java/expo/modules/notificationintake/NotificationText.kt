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

  fun assemble(fields: NotificationFields): String {
    val body = listOfNotNull(fields.bigText, fields.text).firstOrNull { it.isNotBlank() }
      ?: fields.textLines.takeIf { it.isNotEmpty() }?.joinToString("\n")
      ?: fields.subText.orEmpty()
    return listOfNotNull(fields.title, body).filter { it.isNotBlank() }.joinToString("\n")
  }
}
