package expo.modules.notificationintake

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import android.util.Base64
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

internal class AndroidSnapshotStorage(context: Context, private val diagnostics: Boolean = false) : SnapshotStorage {
  private val file = AtomicFile(File(context.noBackupFilesDir, if (diagnostics) "notification-intake-diagnostics-v1.enc" else "notification-intake-v1.enc"))
  private val keyPrefix = if (diagnostics) "lukapp.notification-intake-diagnostics." else "lukapp.notification-intake."
  private val plaintextLimit = if (diagnostics) DIAGNOSTIC_BYTES else 2 * MIB
  private val ciphertextLimit = plaintextLimit * 3 / 2
  private val keystore by lazy {
    try { KeyStore.getInstance("AndroidKeyStore").apply { load(null) } }
    catch (_: Exception) { throw StorageFailure("key_unavailable") }
  }
  private var alias: String? = null
  private val aad = (if (diagnostics) "lukapp.notification-intake.diagnostics.v1" else "lukapp.notification-intake.snapshot.v1").toByteArray(Charsets.UTF_8)

  private fun createKey(): Pair<String, SecretKey> {
    val name = keyPrefix + epoch()
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(name, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256).setRandomizedEncryptionRequired(true).build())
    return name to generator.generateKey()
  }
  override fun read(): ByteArray? {
    val bytes = try { file.openRead().use { input ->
      val output = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(8192)
      while (output.size() <= ciphertextLimit) {
        val count = input.read(buffer, 0, minOf(buffer.size, ciphertextLimit + 1 - output.size()))
        if (count < 0) break
        output.write(buffer, 0, count)
      }
      output.toByteArray()
    } }
      catch (e: java.io.FileNotFoundException) {
        if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists() || alias != null ||
          keystore.aliases().toList().any { it.startsWith(keyPrefix) }) throw StorageFailure("corrupt")
        return null
      }
    if (bytes.size > ciphertextLimit) throw StorageFailure("corrupt")
    try {
      val envelope = JSONObject(String(bytes, Charsets.UTF_8))
      requireInput(envelope.keys().asSequence().toSet() == setOf("version", "key", "iv", "ciphertext"))
      requireInput(envelope.integer("version") == 1L)
      val name = envelope.text("key")
      requireInput(Regex(Regex.escape(keyPrefix) + "[A-Za-z0-9_-]{22}").matches(name))
      val key = try { keystore.getKey(name, null) as? SecretKey } catch (_: Exception) { null }
        ?: throw StorageFailure("key_unavailable")
      val clear = SnapshotEncryption.open(Base64.decode(envelope.text("iv"), Base64.DEFAULT), Base64.decode(envelope.text("ciphertext"), Base64.DEFAULT), key, aad)
      requireInput(clear.size <= plaintextLimit)
      alias = name
      return clear
    } catch (e: StorageFailure) { throw e }
    catch (_: java.security.InvalidKeyException) { throw StorageFailure("key_unavailable") }
    catch (_: Exception) { throw StorageFailure("corrupt") }
  }
  private fun persist(bytes: ByteArray, name: String, key: SecretKey) {
    requireInput(bytes.size <= plaintextLimit)
    val sealed = SnapshotEncryption.seal(bytes, key, aad)
    val envelope = obj("version" to 1, "key" to name, "iv" to Base64.encodeToString(sealed.iv, Base64.NO_WRAP),
      "ciphertext" to Base64.encodeToString(sealed.ciphertext, Base64.NO_WRAP)).toString().toByteArray(Charsets.UTF_8)
    val out = file.startWrite()
    try { out.write(envelope); file.finishWrite(out) }
    catch (e: Exception) { file.failWrite(out); throw e }
    alias = name
  }
  override fun write(bytes: ByteArray) {
    val name = alias
    if (name == null) {
      if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists()) throw StorageFailure("key_unavailable")
      val (created, key) = createKey(); persist(bytes, created, key)
    } else {
      val key = keystore.getKey(name, null) as? SecretKey ?: throw StorageFailure("key_unavailable")
      persist(bytes, name, key)
    }
  }
  override fun recover(bytes: ByteArray) {
    val (name, key) = createKey()
    val retired = keystore.aliases().toList().filter { it.startsWith(keyPrefix) && it != name }
    retired.forEach { keystore.deleteEntry(it) }
    persist(bytes, name, key)
  }
}
