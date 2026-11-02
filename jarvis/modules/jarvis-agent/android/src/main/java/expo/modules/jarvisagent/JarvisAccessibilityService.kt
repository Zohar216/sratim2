package expo.modules.jarvisagent

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/** Result of a UI action. [ok]=false always comes with a human readable (Hebrew) [message]. */
data class ActionResult(val ok: Boolean, val message: String = "") {
  fun toMap() = mapOf("ok" to ok, "message" to message)

  companion object {
    fun fail(message: String) = ActionResult(false, message)
    val OK = ActionResult(true)
  }
}

/**
 * The accessibility service. It is intentionally passive: it does nothing on its own and only
 * acts when the JS agent calls the module. It never logs or stores screen content.
 */
class JarvisAccessibilityService : AccessibilityService() {
  val reader = ScreenReader()
  lateinit var overlay: OverlayController
    private set

  @Volatile
  var lastEventAt: Long = SystemClock.uptimeMillis()
    private set

  /** Set by the overlay STOP button; checked by every action until [clearStop]. */
  @Volatile
  var stopRequested: Boolean = false
    private set

  override fun onServiceConnected() {
    super.onServiceConnected()
    overlay = OverlayController(this).also { it.onStop = { requestStop() } }
    instance = this
    listeners.forEach { it.onServiceStateChanged(true) }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {
    // We only track *when* the UI last changed (for waitForIdle). Content is not inspected.
    lastEventAt = SystemClock.uptimeMillis()
  }

  override fun onInterrupt() = Unit

  override fun onDestroy() {
    if (::overlay.isInitialized) overlay.post { overlay.hideAll() }
    if (instance === this) instance = null
    listeners.forEach { it.onServiceStateChanged(false) }
    super.onDestroy()
  }

  fun requestStop() {
    stopRequested = true
    overlay.post { overlay.hideAll() }
    listeners.forEach { it.onStopRequested() }
  }

  fun clearStop() {
    stopRequested = false
  }

  fun activeRoot(): AccessibilityNodeInfo? = rootInActiveWindow

  fun foregroundPackage(): String = rootInActiveWindow?.packageName?.toString() ?: ""

  // ---- Actions ------------------------------------------------------------------------------

  private fun guard(): ActionResult? {
    if (stopRequested) return ActionResult.fail("הפעולה נעצרה על ידי המשתמש.")
    val pkg = foregroundPackage()
    if (SafetyGuard.isBlocked(pkg)) return ActionResult.fail(SafetyGuard.reasonFor(pkg))
    return null
  }

  fun clickNode(id: Int): ActionResult {
    guard()?.let { return it }
    val node = reader.nodeById(id) ?: return ActionResult.fail("האלמנט $id לא נמצא. קרא את המסך מחדש.")
    return clickResolved(node)
  }

  fun clickText(text: String): ActionResult {
    guard()?.let { return it }
    val root = activeRoot() ?: return ActionResult.fail("אין חלון פעיל.")
    val node = ScreenReader.findByText(root, text) ?: return ActionResult.fail("לא מצאתי על המסך: \"$text\"")
    return clickResolved(node)
  }

  private fun clickResolved(node: AccessibilityNodeInfo): ActionResult {
    val target = ScreenReader.clickableAncestor(node)
    if (target != null && target.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return ActionResult.OK
    // Fallback: tap the center of the element.
    val r = Rect().also { node.getBoundsInScreen(it) }
    if (r.isEmpty) return ActionResult.fail("לא הצלחתי ללחוץ על האלמנט.")
    return tap(r.exactCenterX(), r.exactCenterY())
  }

  fun setText(id: Int?, text: String): ActionResult {
    guard()?.let { return it }
    val root = activeRoot() ?: return ActionResult.fail("אין חלון פעיל.")
    val node = (if (id != null && id >= 0) reader.nodeById(id) else null)
      ?: ScreenReader.findFocusedEditable(root)
      ?: return ActionResult.fail("לא נמצא שדה טקסט על המסך.")
    if (node.isPassword) return ActionResult.fail("Jarvis לא מקליד בשדות סיסמה.")
    if (!node.isEditable) return ActionResult.fail("האלמנט שנבחר אינו שדה טקסט.")
    node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
    val args = Bundle().apply {
      putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
    }
    return if (node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) ActionResult.OK
    else ActionResult.fail("לא הצלחתי להקליד בשדה.")
  }

  fun scroll(direction: String): ActionResult {
    guard()?.let { return it }
    val root = activeRoot() ?: return ActionResult.fail("אין חלון פעיל.")
    val forward = direction == "down" || direction == "right"
    val scrollable = ScreenReader.findLargestScrollable(root)
    if (scrollable != null) {
      val action = if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
      if (scrollable.performAction(action)) return ActionResult.OK
    }
    // Fallback: swipe gesture across the middle of the screen.
    val dm = resources.displayMetrics
    val w = dm.widthPixels.toFloat()
    val h = dm.heightPixels.toFloat()
    return when (direction) {
      "down" -> swipe(w / 2, h * 0.75f, w / 2, h * 0.25f)
      "up" -> swipe(w / 2, h * 0.25f, w / 2, h * 0.75f)
      "left" -> swipe(w * 0.2f, h / 2, w * 0.8f, h / 2)
      "right" -> swipe(w * 0.8f, h / 2, w * 0.2f, h / 2)
      else -> ActionResult.fail("כיוון גלילה לא מוכר: $direction")
    }
  }

  fun global(action: String): ActionResult {
    if (stopRequested) return ActionResult.fail("הפעולה נעצרה על ידי המשתמש.")
    val code = when (action) {
      "back" -> GLOBAL_ACTION_BACK
      "home" -> GLOBAL_ACTION_HOME
      "recents" -> GLOBAL_ACTION_RECENTS
      "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
      else -> return ActionResult.fail("פעולה גלובלית לא מוכרת: $action")
    }
    return if (performGlobalAction(code)) ActionResult.OK else ActionResult.fail("הפעולה $action נכשלה.")
  }

  fun tap(x: Float, y: Float): ActionResult {
    guard()?.let { return it }
    val path = Path().apply { moveTo(x, y) }
    return dispatch(GestureDescription.StrokeDescription(path, 0, 60))
  }

  private fun swipe(x1: Float, y1: Float, x2: Float, y2: Float): ActionResult {
    val path = Path().apply {
      moveTo(x1, y1)
      lineTo(x2, y2)
    }
    return dispatch(GestureDescription.StrokeDescription(path, 0, 350))
  }

  private fun dispatch(stroke: GestureDescription.StrokeDescription): ActionResult {
    val gesture = GestureDescription.Builder().addStroke(stroke).build()
    val dispatched = dispatchGesture(gesture, null, null)
    return if (dispatched) ActionResult.OK else ActionResult.fail("המחווה לא בוצעה.")
  }

  interface Listener {
    fun onServiceStateChanged(enabled: Boolean)
    fun onStopRequested()
  }

  companion object {
    @Volatile
    var instance: JarvisAccessibilityService? = null
      private set

    val listeners = java.util.concurrent.CopyOnWriteArraySet<Listener>()
  }
}
