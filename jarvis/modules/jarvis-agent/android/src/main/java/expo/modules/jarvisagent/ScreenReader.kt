package expo.modules.jarvisagent

import android.graphics.Rect
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo

/** A compact, model-friendly description of one on-screen element. */
data class ScreenNode(
  val id: Int,
  val text: String,
  val description: String,
  val hint: String,
  val viewId: String,
  val className: String,
  val clickable: Boolean,
  val editable: Boolean,
  val scrollable: Boolean,
  val checked: Boolean?,
  val focused: Boolean,
  val password: Boolean,
  val bounds: Rect,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "text" to text,
    "description" to description,
    "hint" to hint,
    "viewId" to viewId,
    "className" to className,
    "clickable" to clickable,
    "editable" to editable,
    "scrollable" to scrollable,
    "checked" to checked,
    "focused" to focused,
    "password" to password,
    "bounds" to listOf(bounds.left, bounds.top, bounds.right, bounds.bottom),
  )
}

data class ScreenSnapshot(
  val packageName: String,
  val nodes: List<ScreenNode>,
  val truncated: Boolean,
  val blocked: Boolean,
)

/**
 * Walks the accessibility tree of the active window and keeps references to the nodes it
 * reported, so later actions can address them by the numeric id the model saw.
 *
 * Privacy: password fields are never read (their text is replaced), and nothing here is
 * persisted — the snapshot lives only in memory until the next read.
 */
class ScreenReader(private val maxNodes: Int = 180) {
  private val lock = Any()
  private var lastNodes: List<AccessibilityNodeInfo> = emptyList()

  fun snapshot(root: AccessibilityNodeInfo?): ScreenSnapshot {
    if (root == null) return ScreenSnapshot("", emptyList(), truncated = false, blocked = false)
    val pkg = root.packageName?.toString() ?: ""
    if (SafetyGuard.isBlocked(pkg)) {
      synchronized(lock) { lastNodes = emptyList() }
      return ScreenSnapshot(pkg, emptyList(), truncated = false, blocked = true)
    }

    val out = ArrayList<ScreenNode>()
    val refs = ArrayList<AccessibilityNodeInfo>()
    var truncated = false

    // Iterative DFS keeps screen order (top-to-bottom as laid out in the tree).
    val stack = ArrayDeque<AccessibilityNodeInfo>()
    stack.addLast(root)
    while (stack.isNotEmpty()) {
      val node = stack.removeLast()
      if (!node.isVisibleToUser) continue

      if (isInteresting(node)) {
        if (out.size >= maxNodes) {
          truncated = true
          break
        }
        val bounds = Rect().also { node.getBoundsInScreen(it) }
        val password = node.isPassword
        out.add(
          ScreenNode(
            id = out.size,
            text = if (password) "[סיסמה מוסתרת]" else clean(node.text),
            description = clean(node.contentDescription),
            hint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) clean(node.hintText) else "",
            viewId = node.viewIdResourceName?.substringAfter(":id/") ?: "",
            className = node.className?.toString()?.substringAfterLast('.') ?: "",
            clickable = node.isClickable || node.isLongClickable,
            editable = node.isEditable,
            scrollable = node.isScrollable,
            checked = if (node.isCheckable) node.isChecked else null,
            focused = node.isFocused,
            password = password,
            bounds = bounds,
          ),
        )
        refs.add(node)
      }

      // Push children in reverse so the first child is processed first.
      for (i in node.childCount - 1 downTo 0) {
        node.getChild(i)?.let { stack.addLast(it) }
      }
    }

    synchronized(lock) { lastNodes = refs }
    return ScreenSnapshot(pkg, out, truncated, blocked = false)
  }

  fun nodeById(id: Int): AccessibilityNodeInfo? = synchronized(lock) { lastNodes.getOrNull(id) }

  private fun isInteresting(node: AccessibilityNodeInfo): Boolean =
    !node.text.isNullOrBlank() ||
      !node.contentDescription.isNullOrBlank() ||
      node.isClickable ||
      node.isEditable ||
      node.isScrollable ||
      node.isCheckable

  private fun clean(value: CharSequence?): String =
    value?.toString()?.replace(Regex("\\s+"), " ")?.trim()?.take(200) ?: ""

  companion object {
    /** Returns the node itself or its nearest ancestor that can be clicked. */
    fun clickableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      var current: AccessibilityNodeInfo? = node
      var depth = 0
      while (current != null && depth < 8) {
        if (current.isClickable) return current
        current = current.parent
        depth++
      }
      return null
    }

    /**
     * Finds the best match for [query] in the tree: exact text/description first, then
     * "contains". Only visible nodes are considered.
     */
    fun findByText(root: AccessibilityNodeInfo, query: String): AccessibilityNodeInfo? {
      val q = query.trim()
      if (q.isEmpty()) return null
      val candidates = root.findAccessibilityNodeInfosByText(q).filter { it.isVisibleToUser }
      fun label(n: AccessibilityNodeInfo) =
        (n.text?.toString() ?: n.contentDescription?.toString() ?: "").trim()
      return candidates.firstOrNull { label(it).equals(q, ignoreCase = true) }
        ?: candidates.firstOrNull { clickableAncestor(it) != null }
        ?: candidates.firstOrNull()
        ?: findByDescription(root, q)
    }

    /** findAccessibilityNodeInfosByText does not always look at contentDescription. */
    private fun findByDescription(root: AccessibilityNodeInfo, q: String): AccessibilityNodeInfo? {
      val stack = ArrayDeque<AccessibilityNodeInfo>()
      stack.addLast(root)
      var visited = 0
      while (stack.isNotEmpty() && visited < 2000) {
        val node = stack.removeLast()
        visited++
        val desc = node.contentDescription?.toString()
        if (node.isVisibleToUser && desc != null && desc.contains(q, ignoreCase = true)) return node
        for (i in node.childCount - 1 downTo 0) node.getChild(i)?.let { stack.addLast(it) }
      }
      return null
    }

    fun findFocusedEditable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { if (it.isEditable) return it }
      val stack = ArrayDeque<AccessibilityNodeInfo>()
      stack.addLast(root)
      while (stack.isNotEmpty()) {
        val node = stack.removeLast()
        if (node.isEditable && node.isVisibleToUser) return node
        for (i in node.childCount - 1 downTo 0) node.getChild(i)?.let { stack.addLast(it) }
      }
      return null
    }

    fun findLargestScrollable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
      var best: AccessibilityNodeInfo? = null
      var bestArea = -1
      val rect = Rect()
      val stack = ArrayDeque<AccessibilityNodeInfo>()
      stack.addLast(root)
      while (stack.isNotEmpty()) {
        val node = stack.removeLast()
        if (node.isScrollable && node.isVisibleToUser) {
          node.getBoundsInScreen(rect)
          val area = rect.width() * rect.height()
          if (area > bestArea) {
            best = node
            bestArea = area
          }
        }
        for (i in node.childCount - 1 downTo 0) node.getChild(i)?.let { stack.addLast(it) }
      }
      return best
    }
  }
}
