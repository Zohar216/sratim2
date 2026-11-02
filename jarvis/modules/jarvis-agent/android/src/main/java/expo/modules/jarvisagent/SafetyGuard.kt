package expo.modules.jarvisagent

/**
 * Native-side safety rules. These are enforced here, inside the native layer, so even a bug
 * in the JS policy (or a confused model) cannot drive these apps.
 *
 * The user can add more packages from the app settings ([extraBlocked]); they cannot remove
 * the built-in entries.
 */
object SafetyGuard {
  /** Apps where automation could change Jarvis' own permissions or install software. */
  private val SYSTEM_PROTECTED = setOf(
    "com.android.settings",
    "com.android.permissioncontroller",
    "com.google.android.permissioncontroller",
    "com.android.packageinstaller",
    "com.google.android.packageinstaller",
    "com.samsung.android.packageinstaller",
    "com.android.vending",
  )

  /** Known payment / banking apps (Israel + global). Matching is also done by heuristics below. */
  private val FINANCIAL = setOf(
    "com.google.android.apps.walletnfcrel",
    "com.samsung.android.spay",
    "com.samsung.android.samsungpay.gear",
    "com.paypal.android.p2pmobile",
    "com.bnhp.payments.paymentsapp", // Bit
    "com.payboxapp",
    "com.ideomobile.hapoalim",
    "com.leumi.leumiwallet",
    "com.leumi.leumidigital",
    "com.ideomobile.discount",
    "com.ideomobile.mizrahi",
    "com.mizrahitefahot.nh",
    "il.co.fibi",
    "com.otsar.hahayal",
    "il.co.yahav",
    "com.onezero.bank",
    "com.max.app",
    "com.isracard.app",
    "com.cal.app",
  )

  @Volatile
  var extraBlocked: Set<String> = emptySet()

  fun isBlocked(packageName: String?): Boolean {
    if (packageName.isNullOrBlank()) return false
    val pkg = packageName.lowercase()
    if (pkg in SYSTEM_PROTECTED || pkg in FINANCIAL || pkg in extraBlocked) return true
    return pkg.split('.').any { seg ->
      seg.contains("bank") ||
        seg.contains("wallet") ||
        seg == "pay" || seg == "spay" || seg == "payments" ||
        seg.startsWith("pay") || seg.endsWith("pay")
    }
  }

  fun reasonFor(packageName: String?): String =
    "Jarvis לא מבצע פעולות באפליקציה הזו ($packageName) מטעמי אבטחה (תשלומים, בנקאות או הגדרות מערכת)."
}
