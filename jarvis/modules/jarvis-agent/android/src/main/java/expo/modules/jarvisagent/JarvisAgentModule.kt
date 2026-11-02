package expo.modules.jarvisagent

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JS bridge ("JarvisAgent"). Every UI action goes through [JarvisAccessibilityService], which
 * enforces [SafetyGuard] and the user's STOP button natively.
 */
class JarvisAgentModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val main = Handler(Looper.getMainLooper())

  private val listener = object : JarvisAccessibilityService.Listener {
    override fun onServiceStateChanged(enabled: Boolean) {
      sendEvent("onServiceStateChanged", mapOf("enabled" to enabled))
    }

    override fun onStopRequested() {
      sendEvent("onStopRequested", emptyMap<String, Any>())
    }
  }

  private fun service(): JarvisAccessibilityService? = JarvisAccessibilityService.instance

  private fun notEnabled() =
    ActionResult.fail("שירות הנגישות של Jarvis כבוי. הפעל אותו בהגדרות > נגישות.").toMap()

  override fun definition() = ModuleDefinition {
    Name("JarvisAgent")

    Events("onServiceStateChanged", "onStopRequested")

    OnCreate { JarvisAccessibilityService.listeners.add(listener) }
    OnDestroy { JarvisAccessibilityService.listeners.remove(listener) }

    // ---- Service state ----------------------------------------------------------------------

    Function("isServiceRunning") { service() != null }

    /** True if enabled in system settings (even if not yet connected). */
    Function("isServiceEnabled") {
      val expected = ComponentName(context, JarvisAccessibilityService::class.java).flattenToString()
      val enabled = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
      ) ?: ""
      enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    Function("openAccessibilitySettings") {
      val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("setExtraBlockedPackages") { packages: List<String> ->
      SafetyGuard.extraBlocked = packages.map { it.lowercase().trim() }.filter { it.isNotEmpty() }.toSet()
    }

    Function("isPackageBlocked") { packageName: String -> SafetyGuard.isBlocked(packageName) }

    // ---- Apps & intents (work without the accessibility service) -----------------------------

    AsyncFunction("getInstalledApps") { AppCatalog.installedApps(context) }

    Function("isAppInstalled") { packageName: String -> AppCatalog.isInstalled(context, packageName) }

    AsyncFunction("launchApp") { packageName: String ->
      AppCatalog.launchApp(context, packageName).toMap()
    }

    AsyncFunction("openIntent") { action: String, data: String?, packageName: String?, extras: Map<String, Any?>? ->
      AppCatalog.openIntent(context, action, data, packageName, extras).toMap()
    }

    // ---- Screen ------------------------------------------------------------------------------

    AsyncFunction("getForegroundPackage") { service()?.foregroundPackage() ?: "" }

    AsyncFunction("getScreen") {
      val svc = service()
      if (svc == null) {
        mapOf<String, Any>(
          "packageName" to "",
          "nodes" to emptyList<Any>(),
          "truncated" to false,
          "blocked" to false,
          "serviceEnabled" to false,
        )
      } else {
        val snap = svc.reader.snapshot(svc.activeRoot())
        mapOf<String, Any>(
          "packageName" to snap.packageName,
          "nodes" to snap.nodes.map { it.toMap() },
          "truncated" to snap.truncated,
          "blocked" to snap.blocked,
          "serviceEnabled" to true,
        )
      }
    }

    // ---- UI actions --------------------------------------------------------------------------

    AsyncFunction("click") { id: Int -> service()?.clickNode(id)?.toMap() ?: notEnabled() }

    AsyncFunction("clickText") { text: String -> service()?.clickText(text)?.toMap() ?: notEnabled() }

    AsyncFunction("setText") { id: Int?, text: String -> service()?.setText(id, text)?.toMap() ?: notEnabled() }

    AsyncFunction("scroll") { direction: String -> service()?.scroll(direction)?.toMap() ?: notEnabled() }

    AsyncFunction("globalAction") { action: String -> service()?.global(action)?.toMap() ?: notEnabled() }

    AsyncFunction("tap") { x: Double, y: Double -> service()?.tap(x.toFloat(), y.toFloat())?.toMap() ?: notEnabled() }

    // ---- Timing (native, so it keeps working while Jarvis is in the background) ----------------

    AsyncFunction("sleep") { ms: Int, promise: Promise ->
      main.postDelayed({ promise.resolve(null) }, ms.coerceIn(0, 30_000).toLong())
    }

    /**
     * Resolves once the UI has been quiet for [quietMs] (no accessibility events) or after
     * [timeoutMs]. Resolves `true` if the screen settled, `false` on timeout.
     */
    AsyncFunction("waitForIdle") { quietMs: Int, timeoutMs: Int, promise: Promise ->
      val start = SystemClock.uptimeMillis()
      val tick = object : Runnable {
        override fun run() {
          val svc = service()
          val now = SystemClock.uptimeMillis()
          when {
            svc == null || svc.stopRequested -> promise.resolve(false)
            now - svc.lastEventAt >= quietMs -> promise.resolve(true)
            now - start >= timeoutMs -> promise.resolve(false)
            else -> main.postDelayed(this, 80)
          }
        }
      }
      main.postDelayed(tick, 80)
    }

    // ---- Overlay: status, STOP, approvals ----------------------------------------------------

    AsyncFunction("showStatus") { text: String ->
      service()?.overlay?.showStatus(text)
      Unit
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("hideStatus") {
      service()?.overlay?.hideStatus()
      Unit
    }.runOnQueue(Queues.MAIN)

    /** Resolves true/false. Rejects with NO_OVERLAY if the service is off (JS falls back to in-app UI). */
    AsyncFunction("requestApproval") { title: String, details: String, promise: Promise ->
      val svc = service()
      if (svc == null) {
        promise.reject("NO_OVERLAY", "Accessibility service is not running", null)
      } else {
        svc.overlay.showApproval(title, details) { approved -> promise.resolve(approved) }
      }
    }.runOnQueue(Queues.MAIN)

    Function("isStopRequested") { service()?.stopRequested ?: false }

    Function("requestStop") { service()?.requestStop() }

    Function("clearStop") { service()?.clearStop() }
  }
}
