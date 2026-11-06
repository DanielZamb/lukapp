package expo.modules.notificationintake

import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object SnapshotEncryption {
  data class Sealed(val iv: ByteArray, val ciphertext: ByteArray)
  fun seal(bytes: ByteArray, key: SecretKey, aad: ByteArray): Sealed {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, key); cipher.updateAAD(aad)
    return Sealed(cipher.iv, cipher.doFinal(bytes))
  }
  fun open(iv: ByteArray, ciphertext: ByteArray, key: SecretKey, aad: ByteArray): ByteArray {
    requireInput(iv.size == 12)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv)); cipher.updateAAD(aad)
    return cipher.doFinal(ciphertext)
  }
}
