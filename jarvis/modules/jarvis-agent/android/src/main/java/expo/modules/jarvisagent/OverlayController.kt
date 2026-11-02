package expo.modules.jarvisagent

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Floating UI drawn by the accessibility service on top of other apps
 * (TYPE_ACCESSIBILITY_OVERLAY needs no extra "draw over apps" permission).
 *
 * - A status pill with an always-visible "עצור" (STOP) button while a task runs.
 * - An approval card for sensitive actions, so the user can approve/deny even while
 *   Jarvis is operating inside WhatsApp or another app.
 *
 * All methods must be called on the main thread (use [post]).
 */
class OverlayController(private val service: AccessibilityService) {
  private val main = Handler(Looper.getMainLooper())
  private val wm = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager

  private var statusView: View? = null
  private var statusText: TextView? = null
  private var approvalView: View? = null
  private var approvalCallback: ((Boolean) -> Unit)? = null

  var onStop: (() -> Unit)? = null

  fun post(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
  }

  fun showStatus(text: String) {
    statusText?.let {
      it.text = text
      return
    }
    val ctx: Context = service
    val container = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutDirection = View.LAYOUT_DIRECTION_RTL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(14), dp(8), dp(8), dp(8))
      background = rounded(Color.parseColor("#E6111827"), dp(24).toFloat())
    }
    val label = TextView(ctx).apply {
      this.text = text
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      maxLines = 2
      maxWidth = dp(240)
    }
    val stop = Button(ctx).apply {
      this.text = "עצור"
      setTextColor(Color.WHITE)
      isAllCaps = false
      background = rounded(Color.parseColor("#DC2626"), dp(18).toFloat())
      minHeight = 0
      minimumHeight = 0
      setPadding(dp(14), dp(6), dp(14), dp(6))
      setOnClickListener { onStop?.invoke() }
    }
    container.addView(label, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    container.addView(stop, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(36)).apply {
      marginStart = dp(10)
    })

    val params = baseParams().apply {
      gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
      y = dp(36)
    }
    try {
      wm.addView(container, params)
      statusView = container
      statusText = label
    } catch (_: Exception) {
      // Window could not be added (service disconnecting). Nothing else to do.
    }
  }

  fun hideStatus() {
    statusView?.let { safeRemove(it) }
    statusView = null
    statusText = null
  }

  /**
   * Shows an approval card. [callback] is called exactly once: true = approved.
   * A newer request auto-denies an older pending one.
   */
  fun showApproval(title: String, details: String, callback: (Boolean) -> Unit) {
    resolveApproval(false)
    val ctx: Context = service
    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      layoutDirection = View.LAYOUT_DIRECTION_RTL
      setPadding(dp(20), dp(18), dp(20), dp(14))
      background = rounded(Color.WHITE, dp(20).toFloat())
      elevation = dp(12).toFloat()
    }
    card.addView(TextView(ctx).apply {
      text = title
      setTextColor(Color.parseColor("#111827"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      setTypeface(typeface, android.graphics.Typeface.BOLD)
      textDirection = View.TEXT_DIRECTION_RTL
    })
    card.addView(TextView(ctx).apply {
      text = details
      setTextColor(Color.parseColor("#374151"))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
      textDirection = View.TEXT_DIRECTION_ANY_RTL
      setPadding(0, dp(8), 0, dp(14))
    })
    val buttons = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutDirection = View.LAYOUT_DIRECTION_RTL
    }
    val approve = Button(ctx).apply {
      text = "אשר"
      isAllCaps = false
      setTextColor(Color.WHITE)
      background = rounded(Color.parseColor("#2563EB"), dp(14).toFloat())
      setOnClickListener { resolveApproval(true) }
    }
    val deny = Button(ctx).apply {
      text = "בטל"
      isAllCaps = false
      setTextColor(Color.parseColor("#111827"))
      background = rounded(Color.parseColor("#E5E7EB"), dp(14).toFloat())
      setOnClickListener { resolveApproval(false) }
    }
    buttons.addView(approve, LinearLayout.LayoutParams(0, dp(46), 1f))
    buttons.addView(deny, LinearLayout.LayoutParams(0, dp(46), 1f).apply { marginStart = dp(10) })
    card.addView(buttons)

    val params = baseParams().apply {
      width = WindowManager.LayoutParams.MATCH_PARENT
      gravity = Gravity.BOTTOM
      y = dp(24)
      horizontalMargin = 0.04f
    }
    try {
      wm.addView(card, params)
      approvalView = card
      approvalCallback = callback
    } catch (_: Exception) {
      callback(false)
    }
  }

  fun resolveApproval(approved: Boolean) {
    val cb = approvalCallback
    approvalCallback = null
    approvalView?.let { safeRemove(it) }
    approvalView = null
    cb?.invoke(approved)
  }

  fun hideAll() {
    resolveApproval(false)
    hideStatus()
  }

  private fun baseParams() = WindowManager.LayoutParams(
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.WRAP_CONTENT,
    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
    PixelFormat.TRANSLUCENT,
  )

  private fun safeRemove(view: View) {
    try {
      wm.removeView(view)
    } catch (_: Exception) {
    }
  }

  private fun rounded(color: Int, radius: Float) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
  }

  private fun dp(value: Int): Int =
    TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value.toFloat(), service.resources.displayMetrics).toInt()
}
