package expo.modules.jarvisagent

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

/** Lists launchable apps and starts activities (apps, deep links, system intents). */
object AppCatalog {
  fun installedApps(context: Context): List<Map<String, String>> {
    val pm = context.packageManager
    val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    val infos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0L))
    } else {
      @Suppress("DEPRECATION")
      pm.queryIntentActivities(intent, 0)
    }
    return infos
      .map { mapOf("label" to it.loadLabel(pm).toString(), "packageName" to it.activityInfo.packageName) }
      .distinctBy { it["packageName"] }
      .sortedBy { it["label"] }
  }

  fun isInstalled(context: Context, packageName: String): Boolean =
    context.packageManager.getLaunchIntentForPackage(packageName) != null

  /** Starts [intent] from the accessibility service if bound (exempt from background-start limits). */
  private fun start(context: Context, intent: Intent): ActionResult {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val launcher: Context = JarvisAccessibilityService.instance ?: context
    return try {
      launcher.startActivity(intent)
      ActionResult.OK
    } catch (e: ActivityNotFoundException) {
      ActionResult.fail("לא נמצאה אפליקציה שיכולה לבצע את הפעולה.")
    } catch (e: SecurityException) {
      ActionResult.fail("אין הרשאה לבצע את הפעולה: ${e.message}")
    }
  }

  /**
   * Opening any app on request is allowed (including banking apps). What is blocked is
   * *operating inside* protected apps — that is enforced in [JarvisAccessibilityService].
   */
  fun launchApp(context: Context, packageName: String): ActionResult {
    val intent = context.packageManager.getLaunchIntentForPackage(packageName)
      ?: return ActionResult.fail("האפליקציה $packageName לא מותקנת.")
    intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return start(context, intent)
  }

  /**
   * Starts an arbitrary *view/system* intent. Only an allow-list of actions is accepted so the
   * JS layer (and the model behind it) cannot fire privileged or unexpected intents.
   */
  fun openIntent(
    context: Context,
    action: String,
    data: String?,
    packageName: String?,
    extras: Map<String, Any?>?,
  ): ActionResult {
    if (action !in ALLOWED_ACTIONS) return ActionResult.fail("פעולת מערכת לא מורשית: $action")
    if (packageName != null && SafetyGuard.isBlocked(packageName)) {
      return ActionResult.fail(SafetyGuard.reasonFor(packageName))
    }
    val intent = Intent(action)
    if (!data.isNullOrBlank()) intent.data = Uri.parse(data)
    if (!packageName.isNullOrBlank()) intent.setPackage(packageName)
    extras?.forEach { (key, value) ->
      when (value) {
        is String -> intent.putExtra(key, value)
        is Boolean -> intent.putExtra(key, value)
        // JS numbers arrive as Double. Alarm/timer extras expect Int.
        is Double -> if (value % 1.0 == 0.0) intent.putExtra(key, value.toInt()) else intent.putExtra(key, value)
        is Int -> intent.putExtra(key, value)
        is Long -> intent.putExtra(key, value.toInt())
      }
    }
    return start(context, intent)
  }

  private val ALLOWED_ACTIONS = setOf(
    Intent.ACTION_VIEW,
    Intent.ACTION_DIAL, // opens the dialer with the number; the user presses call
    Intent.ACTION_SENDTO, // SMS/email compose screens
    Intent.ACTION_WEB_SEARCH,
    "android.intent.action.SET_ALARM",
    "android.intent.action.SET_TIMER",
    "android.intent.action.SHOW_ALARMS",
    "android.settings.ACCESSIBILITY_SETTINGS",
  )
}
