package expo.modules.lukappcustody

import android.app.KeyguardManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.fragment.app.FragmentActivity
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.concurrent.Executor
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class LukappCustodyModule : Module() {
  private val guard = Any()
  private var generation = 0
  private var unlocked = false
  private var admitting = false
  private var foreground = true
  private var idleAt = SystemClock.elapsedRealtime()
  private var backgroundAt: Long? = null
  private var window = 120000L
  private var workspace: String? = null
  private var prompt: BiometricPrompt? = null
  private val promptKeys = PromptKeyOwnership()
  private var promptKey: PromptKeyOwnership.Token? = null
  private val main = Handler(Looper.getMainLooper())
  private var mode = "live"
  private var contactTime: Long? = null
  private var contactUptime: Long? = null
  private val signingAlias get() = "lukapp.installation.p256." + mode
  private val sentinelAlias get() = "lukapp.enrollment." + mode
  private val inputAlias get() = "lukapp.input.aes." + mode
  private val keys get() = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
  private val context get() = requireNotNull(appContext.reactContext)
  private val root get() = File(context.noBackupFilesDir, "LukappDeviceOnly-" + mode).apply { mkdirs() }
  private fun file(name: String) = File(root, name)
  private fun lifecycle() = LifecycleRecords(root, ::write) { AtomicFile(it).openRead().bufferedReader().use { reader -> reader.readText() } }
  private val timer = object : Runnable {
    override fun run() { synchronized(guard) { expireWindow() }; main.postDelayed(this, 1000) }
  }

  override fun definition() = ModuleDefinition {
    Name("LukappCustody")
    Events("change")
    OnCreate { main.post(timer) }
    OnDestroy { main.removeCallbacks(timer); synchronized(guard) { block() } }
    OnActivityEntersBackground { synchronized(guard) {
      main.post { appContext.currentActivity?.window?.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE) }
      foreground = false; backgroundAt = SystemClock.elapsedRealtime()
      admitting = false
      workspace = null; generation++; cancelPrompt(); emit()
    } }
    OnActivityEntersForeground { synchronized(guard) {
      main.post { appContext.currentActivity?.window?.clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE) }
      foreground = true
      if (backgroundAt?.let { SystemClock.elapsedRealtime() - it >= 120000 } == true) block()
      backgroundAt = null; expireWindow(); emit()
    } }
    Function("state") { synchronized(guard) { expireWindow(); snapshot() } }
    Function("lock") { synchronized(guard) { block() } }
    Function("hasRetainedCustody") { expectedMode: String -> synchronized(guard) {
      check(expectedMode == mode) { "custody_mode_changed" }
      listOf(signingAlias, sentinelAlias, inputAlias).any { keys.containsAlias(it) } || requireNotNull(root.listFiles()).any { !LifecycleRecords.preserved(it.name) }
    } }
    Function("readRecovery") { expectedMode: String -> synchronized(guard) { check(expectedMode == mode) { "custody_mode_changed" }; lifecycle().readRecovery().toString() } }
    AsyncFunction("writeRecovery") { raw: String, revision: Double, expectedMode: String, expected: Int -> synchronized(guard) {
      check(expectedMode == mode && expected == generation) { "lifecycle_owner_stale" }; check(revision.isFinite() && revision == revision.toLong().toDouble() && revision >= 0) { "lifecycle_metadata_invalid" }; lifecycle().writeRecovery(raw, revision.toLong())
    } }
    Function("readRevocations") { expectedMode: String -> synchronized(guard) { check(expectedMode == mode) { "custody_mode_changed" }; lifecycle().readRevocations().map { it.toString() } } }
    AsyncFunction("writeRevocation") { raw: String, revision: Double, expectedMode: String, expected: Int -> synchronized(guard) {
      check(expectedMode == mode && expected == generation) { "lifecycle_owner_stale" }; check(revision.isFinite() && revision == revision.toLong().toDouble() && revision >= -1) { "lifecycle_metadata_invalid" }; lifecycle().writeRevocation(raw, revision.toLong())
    } }
    Function("closeInput") { synchronized(guard) { admitting = false; workspace = null; generation++; emit() } }
    Function("touch") { synchronized(guard) { expireWindow(); if (unlocked && admitting && foreground) idleAt = SystemClock.elapsedRealtime() } }
    Function("resumeAdmission") { synchronized(guard) {
      expireWindow()
      if (!unlocked || !foreground || file("wipe").exists() || !file("installed").exists()) null
      else { checkEnrollment(); admitting = true; emit(); snapshot() }
    } }
    Function("setScreen") { screen: String -> synchronized(guard) {
      expireWindow(); if (screen == "ordinary" || screen == "month-close") window = if (screen == "month-close") 600000 else 120000
    } }
    AsyncFunction("initialize") { selectedMode: String, expected: Int -> synchronized(guard) {
      check(expected == generation) { "custody_initialization_stale" }
      check(android.os.Build.VERSION.SDK_INT >= 33) { "native_platform_unavailable" }
      check(selectedMode == "live" || (BuildConfig.DEVELOPMENT_CUSTODY && selectedMode == "fixture")) { "mode_invalid" }
      block(); mode = selectedMode
      if (!file("installed").exists()) write(file("wipe"), byteArrayOf(1)); snapshot()
    } }
    AsyncFunction("unlock") { reason: String, promise: Promise -> authenticate(reason, promise) }
    AsyncFunction("publicKey") { expected: Int -> synchronized(guard) {
      requireContact(expected)
      if (!keys.containsAlias(signingAlias)) {
        KeyPairGenerator.getInstance("EC", "AndroidKeyStore").apply {
          initialize(KeyGenParameterSpec.Builder(signingAlias, KeyProperties.PURPOSE_SIGN)
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256).setUnlockedDeviceRequired(true).build())
        }.generateKeyPair()
      }
      val privateKey = keys.getKey(signingAlias, null) as PrivateKey
      requireSigningProtection(privateKey)
      val key = keys.getCertificate(signingAlias).publicKey as ECPublicKey
      fun coordinate(value: java.math.BigInteger): ByteArray {
        val bytes = value.toByteArray()
        val positive = if (bytes.size == 33 && bytes[0] == 0.toByte()) bytes.copyOfRange(1, 33) else bytes
        require(positive.size <= 32) { "public_key_invalid" }
        return ByteArray(32 - positive.size) + positive
      }
      requireContact(expected)
      hex(byteArrayOf(4) + coordinate(key.w.affineX) + coordinate(key.w.affineY))
    } }
    AsyncFunction("sign") { message: String, expected: Int -> synchronized(guard) {
      requireContact(expected)
      val key = keys.getKey(signingAlias, null) as? PrivateKey ?: error("installation_key_lost")
      requireSigningProtection(key)
      val signature = Signature.getInstance("SHA256withECDSA").run {
        initSign(key); update(message.toByteArray(Charsets.UTF_8)); sign()
      }
      requireContact(expected)
      mapOf("format" to "der", "signature" to hex(signature))
    } }
    AsyncFunction("deleteKey") { synchronized(guard) { block(); keys.deleteEntry(signingAlias) } }
    Function("enrollmentPending") { digest: String, expected: Int -> synchronized(guard) {
      requireContact(expected); file("enrollment-pending").takeIf { it.exists() }?.readText() == digest
    } }
    AsyncFunction("setEnrollmentPending") { digest: String?, expected: Int -> synchronized(guard) {
      requireContact(expected)
      if (digest != null) { require(digest.matches(Regex("^[a-f0-9]{64}$"))) { "digest_invalid" }; write(file("enrollment-pending"), digest.toByteArray()) }
      else if (file("enrollment-pending").exists()) check(file("enrollment-pending").delete()) { "marker_deletion_failed" }
    } }
    AsyncFunction("openInput") { id: String, expected: Int, serverContactAt: Long -> synchronized(guard) {
      requireContact(expected); require(id.isNotBlank() && serverContactAt > 0) { "workspace_required" }
      contactTime = serverContactAt; contactUptime = SystemClock.elapsedRealtime(); retentionTime()
      workspace = id; write(file("workspace"), id.toByteArray(Charsets.UTF_8))
    } }
    AsyncFunction("inputPut") { owner: String, id: String, content: String, expected: Int -> synchronized(guard) {
      val scope = requireInput(owner, expected)
      require(id.matches(Regex("^[a-zA-Z0-9_-]{1,100}$")) && content.toByteArray().size <= 65536) { "input_invalid" }
      val records = read(owner, scope)
      val now = retentionTime()
      val old = records.firstOrNull { it.getString("id") == id }
      check(old == null || (!old.isNull("content") && now < old.getLong("expiresAt"))) { "input_expired" }
      records.removeAll { it.getString("id") == id }
      records.add(JSONObject().put("id", id).put("content", content)
        .put("createdAt", old?.getLong("createdAt") ?: now)
        .put("expiresAt", old?.getLong("expiresAt") ?: now + 1296000000))
      save(records, owner, scope); requireContact(expected)
    } }
    AsyncFunction("inputList") { owner: String, expected: Int -> synchronized(guard) {
      val scope = requireInput(owner, expected)
      val records = read(owner, scope).filter { !it.isNull("content") }.map { it.getString("content") }
      requireContact(expected); records
    } }
    AsyncFunction("inputDelete") { owner: String, id: String, expected: Int -> synchronized(guard) {
      val scope = requireInput(owner, expected)
      save(read(owner, scope).map { if (it.getString("id") == id) it.put("content", JSONObject.NULL) else it }, owner, scope)
    } }
    AsyncFunction("beginWipe") { expectedMode: String -> synchronized(guard) { check(expectedMode == mode) { "custody_mode_changed" }; block(); write(file("wipe"), byteArrayOf(1)); emit() } }
    AsyncFunction("erase") { expectedMode: String -> synchronized(guard) {
      check(expectedMode == mode) { "custody_mode_changed" }
      block(); check(file("wipe").exists()) { "wipe_marker_required" }
      for (alias in listOf(signingAlias, sentinelAlias, inputAlias)) keys.deleteEntry(alias)
      for (item in requireNotNull(root.listFiles())) {
        if (!LifecycleRecords.preserved(item.name) || item.name in listOf("installed", "erased")) check(item.deleteRecursively()) { "input_deletion_failed" }
      }
      write(file("erased"), byteArrayOf(1))
    } }
    AsyncFunction("finishWipe") { expectedMode: String -> synchronized(guard) {
      check(expectedMode == mode) { "custody_mode_changed" }
      block(); check(file("wipe").exists() && file("erased").exists() && !keys.containsAlias(signingAlias)) { "wipe_incomplete" }
      write(file("installed"), byteArrayOf(1)); check(file("erased").delete()) { "marker_deletion_failed" }
      if (file("wipe").exists()) check(file("wipe").delete()) { "wipe_marker_deletion_failed" }
      emit()
    } }
  }

  private fun block() {
    unlocked = false; admitting = false; workspace = null; generation++
    contactTime = null; contactUptime = null
    cancelPrompt(); emit()
  }
  private fun deletePromptKey(token: PromptKeyOwnership.Token?) {
    if (token != null && promptKeys.release(token)) keys.deleteEntry(token.alias)
  }
  private fun cancelPrompt() {
    val cancelled = prompt
    prompt = null
    deletePromptKey(promptKey)
    promptKey = null
    cancelled?.cancelAuthentication()
  }
  private fun expireWindow() {
    if (unlocked && foreground && SystemClock.elapsedRealtime() - idleAt >= window) block()
    val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (unlocked && keyguard.isDeviceLocked) block()
  }
  private fun emit() { sendEvent("change", snapshot()) }
  private fun snapshot(): Map<String, Any?> {
    val present = keys.containsAlias(signingAlias)
    val protection = if (!present) "android-keystore" else {
      val key = keys.getKey(signingAlias, null) as PrivateKey
      val info = KeyFactory.getInstance("EC", "AndroidKeyStore").getKeySpec(key, KeyInfo::class.java)
      when (info.securityLevel) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "android-strongbox"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "android-tee"
        else -> "android-native-software-keystore"
      }
    }
    return mapOf("mode" to mode, "generation" to generation, "unlocked" to (unlocked && admitting && foreground),
      "wipePending" to file("wipe").exists(), "installed" to file("installed").exists(),
      "workspaceId" to workspace, "keyPresent" to present, "protection" to protection,
      "savedWorkspaceId" to if (file("workspace").exists()) file("workspace").readText() else null)
  }
  private fun requireContact(expected: Int) {
    expireWindow()
    check(expected == generation && unlocked && admitting && foreground && !file("wipe").exists() && file("installed").exists()) { "native_locked" }
    checkEnrollment()
  }
  private fun checkEnrollment() {
    try {
      check(BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS) { "enrollment_changed" }
      val bytes = file("sentinel").readBytes()
      val key = keys.getKey(sentinelAlias, null) as SecretKey
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      try { check(cipher.doFinal(bytes.copyOfRange(12, bytes.size)).contentEquals("lukapp-sentinel".toByteArray())) { "enrollment_changed" } }
      catch (error: Exception) {
        val needsAuthentication = generateSequence(error as Throwable?) { it.cause }.any {
          it is android.security.keystore.UserNotAuthenticatedException ||
            (it is android.security.KeyStoreException && it.requiresUserAuthentication())
        }
        if (!needsAuthentication) throw error
      }
    } catch (_: Exception) { block(); error("enrollment_changed") }
  }
  private fun requireSigningProtection(key: PrivateKey) {
    val info = KeyFactory.getInstance("EC", "AndroidKeyStore").getKeySpec(key, KeyInfo::class.java)
    val debugVirtual = BuildConfig.DEVELOPMENT_CUSTODY &&
      (android.os.Build.FINGERPRINT.contains("generic") || android.os.Build.MODEL.contains("sdk"))
    check(debugVirtual || info.securityLevel == KeyProperties.SECURITY_LEVEL_STRONGBOX || info.securityLevel == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT) { "hardware_key_unavailable" }
  }
  private fun requireInput(owner: String, expected: Int): String {
    requireContact(expected); require(owner == "draft" || owner == "candidate") { "input_owner_invalid" }
    return workspace ?: error("input_not_admitted")
  }
  private fun authenticate(reason: String, promise: Promise) {
    val (attempt, originMode, sentinel) = synchronized(guard) { block(); Triple(generation, mode, file("sentinel")) }
    val originAlias = "lukapp.enrollment." + originMode
    val originSigningAlias = "lukapp.installation.p256." + originMode
    var createdKey: PromptKeyOwnership.Token? = null
    main.post {
      try {
        val activity = appContext.throwingActivity as? FragmentActivity ?: error("activity_required")
        check(BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG) == BiometricManager.BIOMETRIC_SUCCESS) { "strong_biometry_required" }
        var bytes: ByteArray? = null
        val cipher = synchronized(guard) {
          check(generation == attempt && mode == originMode && foreground) { "unlock_stale" }
          val existed = keys.containsAlias(originAlias)
          check(existed == sentinel.exists()) { "enrollment_sentinel_lost" }
          if (!existed) {
            check(!keys.containsAlias(originSigningAlias)) { "enrollment_sentinel_lost" }
            KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
              init(KeyGenParameterSpec.Builder(originAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true).build())
            }.generateKey()
            createdKey = promptKeys.claim(originAlias)
            promptKey = createdKey
          }
          val key = keys.getKey(originAlias, null) as SecretKey
          bytes = if (existed) sentinel.readBytes() else null
          Cipher.getInstance("AES/GCM/NoPadding").apply {
            val prior = bytes
            if (prior != null) init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, prior.copyOfRange(0, 12)))
            else init(Cipher.ENCRYPT_MODE, key)
          }
        }
        val auth = BiometricPrompt(activity, Executor { main.post(it) }, object : BiometricPrompt.AuthenticationCallback() {
          override fun onAuthenticationError(code: Int, message: CharSequence) {
            synchronized(guard) {
              if (generation == attempt && mode == originMode) block()
              deletePromptKey(createdKey)
            }
            promise.reject("unlock_declined", "Full online sign-in is required", null)
          }
          override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            try {
              val state = synchronized(guard) {
                check(generation == attempt && mode == originMode && foreground && !file("wipe").exists()) { "unlock_stale" }
                val authenticated = result.cryptoObject?.cipher ?: error("strong_biometry_required")
                val prior = bytes
                if (prior != null) check(authenticated.doFinal(prior.copyOfRange(12, prior.size)).contentEquals("lukapp-sentinel".toByteArray())) { "enrollment_changed" }
                else write(sentinel, authenticated.iv + authenticated.doFinal("lukapp-sentinel".toByteArray()))
                createdKey?.let { promptKeys.release(it) }
                promptKey = null; prompt = null; unlocked = true; admitting = true; idleAt = SystemClock.elapsedRealtime(); emit(); snapshot()
              }
              promise.resolve(state)
            } catch (_: Exception) {
              synchronized(guard) { deletePromptKey(createdKey) }
              promise.reject("unlock_required", "Enrollment or access changed", null)
            }
          }
        })
        synchronized(guard) { check(generation == attempt && mode == originMode) { "unlock_stale" }; prompt = auth }
        auth.authenticate(BiometricPrompt.PromptInfo.Builder().setTitle(reason)
          .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
          .setNegativeButtonText("Sign in instead").build(), BiometricPrompt.CryptoObject(cipher))
      } catch (_: Exception) {
        synchronized(guard) { deletePromptKey(createdKey) }
        promise.reject("biometry_unavailable", "Full online sign-in is required", null)
      }
    }
  }
  private fun inputKey(): SecretKey {
    if (!keys.containsAlias(inputAlias)) KeyGenerator.getInstance("AES", "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(inputAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setUnlockedDeviceRequired(true).build())
    }.generateKey()
    return keys.getKey(inputAlias, null) as SecretKey
  }
  private fun store(owner: String, scope: String) = file(owner + "-" + hex(MessageDigest.getInstance("SHA-256").digest(scope.toByteArray())) + ".db")
  private fun retentionTime(): Long {
    val now = (contactTime ?: error("input_not_admitted")) + SystemClock.elapsedRealtime() - (contactUptime ?: error("input_not_admitted"))
    val clock = file("clock")
    if (clock.exists() && now < clock.readText().toLong()) {
      error("input_clock_uncertain")
    }
    write(clock, now.toString().toByteArray()); return now
  }
  private fun databaseKey(): ByteArray {
    val target = file("sqlcipher-key")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    if (target.exists()) {
      check(keys.containsAlias(inputAlias)) { "input_key_lost" }
      val bytes = target.readBytes()
      check(bytes.size >= 28) { "input_key_lost" }
      cipher.init(Cipher.DECRYPT_MODE, inputKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      cipher.updateAAD(("sqlcipher-key:" + mode).toByteArray(Charsets.UTF_8))
      return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).also { check(it.size == 32) { "input_key_lost" } }
    }
    check(requireNotNull(root.listFiles()).none { it.extension == "sqlcipher" }) { "input_key_lost" }
    check(keys.containsAlias(inputAlias) || requireNotNull(root.listFiles()).none { it.extension == "db" }) { "input_key_lost" }
    val bytes = ByteArray(32).also { java.security.SecureRandom().nextBytes(it) }
    try {
      cipher.init(Cipher.ENCRYPT_MODE, inputKey())
      cipher.updateAAD(("sqlcipher-key:" + mode).toByteArray(Charsets.UTF_8))
      write(target, cipher.iv + cipher.doFinal(bytes))
      return bytes
    } catch (error: Exception) { bytes.fill(0); throw error }
  }
  private fun database(owner: String, scope: String): SqlCipherInput {
    val legacy = store(owner, scope)
    val key = databaseKey()
    val database = try { SqlCipherInput(File(legacy.parentFile, legacy.nameWithoutExtension + ".sqlcipher"), owner + ":" + scope, key) }
      finally { key.fill(0) }
    try {
      if (legacy.exists()) {
        val bytes = legacy.readBytes()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, inputKey(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        cipher.updateAAD((owner + ":" + scope).toByteArray(Charsets.UTF_8))
        val decrypted = cipher.doFinal(bytes.copyOfRange(12, bytes.size))
        try {
          val array = JSONArray(String(decrypted, Charsets.UTF_8))
          database.save((0 until array.length()).map { array.getJSONObject(it) }, importing = true)
        } finally { decrypted.fill(0) }
        check(legacy.delete()) { "input_deletion_failed" }
      }
      return database
    } catch (error: Exception) { database.close(); throw error }
  }
  private fun read(owner: String, scope: String): MutableList<JSONObject> {
    val now = retentionTime()
    return database(owner, scope).use { database ->
      val all = database.read()
      var changed = false
      val kept = all.map {
        if ((now < it.getLong("createdAt") || now >= it.getLong("expiresAt")) && !it.isNull("content")) {
          changed = true; it.put("content", JSONObject.NULL)
        } else it
      }.toMutableList()
      if (changed) database.save(kept)
      kept
    }
  }
  private fun save(records: List<JSONObject>, owner: String, scope: String) {
    database(owner, scope).use { it.save(records) }
  }
  private fun write(target: File, bytes: ByteArray) {
    val atomic = AtomicFile(target)
    val stream = atomic.startWrite()
    try { stream.write(bytes); atomic.finishWrite(stream) }
    catch (error: Exception) { atomic.failWrite(stream); throw error }
  }
  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
}
