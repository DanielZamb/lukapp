package expo.modules.notificationintake

import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.provider.Settings
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.roundToInt
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

class NotificationIntakeModule : Module() {
  private val intake get() = IntakeRuntime.get(appContext.reactContext ?: throw IntakeFailure("CORRUPT_STATE"))
  private fun json(input: Map<String, Any?>) = JSONObject(input)
  private fun bridge(value: Any?): Any? = when (value) {
    null, JSONObject.NULL -> null
    is JSONObject -> value.keys().asSequence().associateWith { bridge(value.get(it)) }
    is JSONArray -> (0 until value.length()).map { bridge(value.get(it)) }
    else -> value
  }
  private fun call(action: () -> Any?): Any? = try { bridge(action()) }
    catch (e: IntakeFailure) { throw CodedException(e.code, e.code, null) }
    catch (_: org.json.JSONException) { throw CodedException("INVALID_INPUT", "INVALID_INPUT", null) }
    catch (_: IllegalArgumentException) { throw CodedException("INVALID_INPUT", "INVALID_INPUT", null) }

  /** Launcher apps this app may see under Android package visibility (the manifest's MAIN/LAUNCHER query). */
  private fun launcherPackages(): List<String> {
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return intake.context.packageManager.queryIntentActivities(intent, 0).map { it.activityInfo.packageName }
      .distinct().filter { it != intake.context.packageName }
  }

  private fun iconPng(icon: Drawable, px: Int): String {
    val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    val bounds = icon.copyBounds()
    icon.setBounds(0, 0, px, px)
    icon.draw(Canvas(bitmap))
    icon.bounds = bounds
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    bitmap.recycle()
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  override fun definition() = ModuleDefinition {
    Name("NotificationIntake")
    Constants("apiVersion" to 3, "diagnosticsEnabled" to BuildConfig.INTAKE_DIAGNOSTICS)
    Events("onChange")
    OnCreate { intake.repository.onChange = { sendEvent("onChange", it) } }
    OnDestroy { intake.repository.onChange = null }
    OnActivityEntersForeground {
      val status = intake.repository.status(intake.access())
      if (status.text("storageState") == "healthy") intake.recover(status.text("epoch"))
    }
    OnActivityEntersBackground { intake.cancelRecovery() }
    if (BuildConfig.INTAKE_DIAGNOSTICS) {
      AsyncFunction("listDiagnostics") { input: Map<String, Any?> -> call { intake.repository.listDiagnostics(json(input)) } }
      AsyncFunction("readDiagnostic") { input: Map<String, Any?> -> call { intake.repository.readDiagnostic(json(input)) } }
      AsyncFunction("deleteDiagnostic") { input: Map<String, Any?> -> call { intake.repository.deleteDiagnostic(json(input)) } }
      AsyncFunction("clearDiagnostics") { input: Map<String, Any?> -> call { intake.repository.clearDiagnostics(json(input)) } }
    }
    AsyncFunction("getStatus") { call { intake.repository.status(intake.access()) } }
    AsyncFunction("listSources") { call {
      if (intake.repository.status(intake.access()).text("storageState") != "healthy") throw IntakeFailure("CORRUPT_STATE")
      launcherPackages().map { pkg ->
          mapOf("packageName" to pkg, "label" to intake.context.packageManager.getApplicationLabel(intake.context.packageManager.getApplicationInfo(pkg, 0)).toString())
        }.sortedBy { it.getValue("label").lowercase() }
    } }
    // App logos for the sources list, as base64 PNG keyed by package. Only launcher apps
    // this app can already see are drawn; anything else is left out and shows its letter.
    AsyncFunction("listSourceIcons") { input: Map<String, Any?> -> call {
      val request = json(input)
      val names = request.getJSONArray("packageNames")
      val dp = request.getInt("size")
      if (names.length() > 64 || dp < 16 || dp > 96) throw IllegalArgumentException("icon request")
      val px = (dp * intake.context.resources.displayMetrics.density).roundToInt().coerceIn(16, 288)
      val visible = launcherPackages().toSet()
      val icons = JSONObject()
      for (index in 0 until names.length()) {
        val pkg = names.getString(index)
        if (pkg !in visible || icons.has(pkg)) continue
        try { icons.put(pkg, iconPng(intake.context.packageManager.getApplicationIcon(pkg), px)) }
        catch (_: PackageManager.NameNotFoundException) {}
      }
      icons
    } }
    AsyncFunction("openAccessSettings") {
      intake.context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    AsyncFunction("configure") { input: Map<String, Any?> -> call {
      val result = intake.repository.configure(json(input)); intake.cancelRecovery(); intake.recover(result.text("epoch")); result
    } }
    AsyncFunction("listPending") { input: Map<String, Any?> -> call { intake.repository.list(json(input)) } }
    AsyncFunction("acknowledge") { input: Map<String, Any?> -> call { intake.repository.acknowledge(json(input)) } }
    AsyncFunction("readCandidateState") { input: Map<String, Any?> -> call { intake.repository.readCandidate(json(input)) } }
    AsyncFunction("writeCandidateState") { input: Map<String, Any?> -> call { intake.repository.writeCandidate(json(input)) } }
    AsyncFunction("dismissNotices") { input: Map<String, Any?> -> call { intake.repository.dismiss(json(input)); null } }
    AsyncFunction("retryConnection") { input: Map<String, Any?> -> call {
      val expected = json(input).text("expectedEpoch"); intake.repository.check(expected); intake.recover(expected, true); intake.repository.status(intake.access())
    } }
    AsyncFunction("disableAndWipe") { input: Map<String, Any?> -> call {
      val result = intake.repository.wipe(json(input)); intake.cancelRecovery(); result
    } }
  }
}
