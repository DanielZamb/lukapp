package expo.modules.notificationintake

import android.content.Intent
import android.provider.Settings
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
      val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      intake.context.packageManager.queryIntentActivities(intent, 0).map { it.activityInfo.packageName }
        .distinct().filter { it != intake.context.packageName }.map { pkg ->
          mapOf("packageName" to pkg, "label" to intake.context.packageManager.getApplicationLabel(intake.context.packageManager.getApplicationInfo(pkg, 0)).toString())
        }.sortedBy { it.getValue("label").lowercase() }
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
