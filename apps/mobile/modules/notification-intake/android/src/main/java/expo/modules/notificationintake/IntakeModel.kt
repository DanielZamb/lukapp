package expo.modules.notificationintake

import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom

internal const val RETENTION = 1_296_000_000L
internal const val MIB = 1_048_576
internal const val SAFE_INTEGER = 9_007_199_254_740_991L

internal class IntakeFailure(val code: String) : RuntimeException(code)
internal fun requireInput(ok: Boolean) { if (!ok) throw IntakeFailure("INVALID_INPUT") }
internal fun token(value: String): String {
  requireInput(value.length in 1..64 && value.all { it.code in 33..126 })
  return value
}
internal object WireBase64 {
  private const val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  fun encode(bytes: ByteArray): String {
    val output = StringBuilder(); var bits = 0; var value = 0
    for (byte in bytes) {
      value = (value shl 8) or (byte.toInt() and 255); bits += 8
      while (bits >= 6) { bits -= 6; output.append(alphabet[(value ushr bits) and 63]) }
    }
    if (bits > 0) output.append(alphabet[(value shl (6 - bits)) and 63])
    return output.toString()
  }
  fun decode(text: String): ByteArray {
    requireInput(text.length % 4 != 1)
    val output = java.io.ByteArrayOutputStream(); var bits = 0; var value = 0
    for (char in text) {
      val digit = alphabet.indexOf(char); requireInput(digit >= 0)
      value = (value shl 6) or digit; bits += 6
      if (bits >= 8) { bits -= 8; output.write((value ushr bits) and 255) }
    }
    requireInput(bits == 0 || (value and ((1 shl bits) - 1)) == 0)
    return output.toByteArray()
  }
}
internal fun packageName(value: String): String {
  requireInput(value.length <= 255 && Regex("[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+").matches(value))
  return value
}
internal fun epoch() = WireBase64.encode(ByteArray(16).also { SecureRandom().nextBytes(it) })
internal fun digest(value: ByteArray) = WireBase64.encode(MessageDigest.getInstance("SHA-256").digest(value))
internal fun captureId(pkg: String, key: String, time: Long): String {
  val fields = listOf(pkg, key, time.toString()).map { it.toByteArray(Charsets.UTF_8) }
  val bytes = ByteBuffer.allocate(fields.sumOf { it.size + 4 })
  fields.forEach { bytes.putInt(it.size).put(it) }
  return digest(bytes.array())
}
internal fun obj(vararg pairs: Pair<String, Any?>) = JSONObject().apply {
  pairs.forEach { (key, value) -> put(key, value ?: JSONObject.NULL) }
}
internal fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
internal fun JSONObject.text(key: String) = get(key).let { requireInput(it is String); it as String }
internal fun JSONObject.integer(key: String): Long {
  val v = get(key)
  requireInput(v is Number && v.toDouble().isFinite() && v.toDouble() % 1.0 == 0.0 && v.toDouble() in 0.0..SAFE_INTEGER.toDouble())
  return (v as Number).toLong()
}
internal data class ParsedAmount(val direction: String?, val amountMinorUnits: Long?, val currency: String?, val description: String = "")
internal sealed interface ParseResult {
  data class Accepted(val amount: ParsedAmount, val reviewReasons: List<String> = emptyList()) : ParseResult
  data class Discard(val reason: String) : ParseResult
}
internal data class CapturePermit(val epoch: String, val packageName: String, val selection: String, val consent: String, val since: Long)

internal fun canonical(value: Any?): String = when (value) {
  null, JSONObject.NULL -> "null"
  is JSONObject -> value.keys().asSequence().toList().sorted().joinToString(",", "{", "}") { JSONObject.quote(it) + ":" + canonical(value.get(it)) }
  is JSONArray -> (0 until value.length()).joinToString(",", "[", "]") { canonical(value.get(it)) }
  is String -> JSONObject.quote(value)
  is Boolean, is Number -> value.toString()
  else -> throw IntakeFailure("INVALID_INPUT")
}
