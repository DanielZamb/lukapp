package expo.modules.cameracutout

import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewTreeObserver
import androidx.core.view.ViewCompat
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CameraCutoutModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var observing = false
  private var root: View? = null
  private var treeObserver: ViewTreeObserver? = null
  private var revision = 0L
  private var facts: Map<String, Any?>? = null
  private val preDrawListener = ViewTreeObserver.OnPreDrawListener {
    refresh()
    true
  }

  override fun definition() = ModuleDefinition {
    Name("CameraCutout")
    Events("onCutoutChange")

    AsyncFunction("getSnapshot") {
      refresh()
      snapshot()
    }.runOnQueue(Queues.MAIN)

    OnStartObserving {
      mainHandler.post {
        observing = true
        refresh()
      }
    }
    OnStopObserving {
      mainHandler.post {
        observing = false
        detach()
      }
    }
    OnActivityEntersForeground {
      mainHandler.post { if (observing) refresh() }
    }
    OnActivityEntersBackground {
      mainHandler.post { detach() }
    }
    OnActivityDestroys {
      mainHandler.post {
        detach()
        updateFacts(null)
      }
    }
    OnDestroy {
      mainHandler.post {
        observing = false
        detach()
      }
    }
  }

  private fun refresh() {
    val currentRoot = appContext.currentActivity?.window?.decorView
    if (observing && (root !== currentRoot || treeObserver?.isAlive != true)) {
      detach()
      root = currentRoot
      treeObserver = currentRoot?.viewTreeObserver
      treeObserver?.addOnPreDrawListener(preDrawListener)
    }
    updateFacts(readFacts(currentRoot))
  }

  private fun readFacts(view: View?): Map<String, Any?>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P || view == null || !view.isAttachedToWindow) return null
    val density = view.resources.displayMetrics.density.toDouble()
    if (view.width <= 0 || view.height <= 0 || !density.isFinite() || density <= 0) return null
    val insets = ViewCompat.getRootWindowInsets(view) ?: return null
    val rects = insets.displayCutout?.boundingRects.orEmpty().map { rect ->
      mapOf(
        "x" to rect.left / density,
        "y" to rect.top / density,
        "width" to rect.width() / density,
        "height" to rect.height() / density
      )
    }
    return mapOf(
      "platform" to "android",
      "portrait" to (view.height > view.width),
      "windowWidth" to view.width / density,
      "rects" to rects
    )
  }

  private fun updateFacts(next: Map<String, Any?>?) {
    if (next == facts) return
    facts = next
    revision += 1
    if (observing) sendEvent("onCutoutChange", snapshot())
  }

  private fun snapshot(): Map<String, Any?> = mapOf("revision" to revision, "facts" to facts)

  private fun detach() {
    treeObserver?.takeIf { it.isAlive }?.removeOnPreDrawListener(preDrawListener)
    treeObserver = null
    root = null
  }
}
