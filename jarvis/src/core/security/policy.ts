import type { Action } from '../actions/schema';
import { normalizeText } from '../agent/hebrew';

/**
 * Permission tiers:
 *  1 — read-only / navigation (open app, read screen, scroll, back)        → never asks
 *  2 — changes local state, reversible (type text, set alarm, compose)     → asks if the user chose so
 *  3 — outward-facing or irreversible (send, delete, buy, confirm, post)   → ALWAYS asks
 *
 * The model has no tool that can change these settings, and the policy is evaluated outside
 * the model. Blocked apps are additionally enforced in native code (SafetyGuard.kt).
 */
export type Tier = 1 | 2 | 3;

export type PolicySettings = {
  /** Ask before tier-2 actions too (default false). Tier 3 always asks. */
  confirmTier2: boolean;
  /** Allow UI automation (click/type/scroll) through the accessibility service. */
  allowUiAutomation: boolean;
};

export type PolicyContext = {
  /** Label of the element a click targets (resolved from the last screen read), if known. */
  targetLabel?: string;
  /** Package currently in the foreground, if known. */
  foregroundPackage?: string;
};

export type Decision =
  | { kind: 'allow'; tier: Tier }
  | { kind: 'confirm'; tier: Tier; title: string; details: string }
  | { kind: 'deny'; tier: Tier; reason: string };

const BASE_TIER: Record<Action['action'], Tier> = {
  open_app: 1,
  read_screen: 1,
  scroll: 1,
  back: 1,
  home: 1,
  wait: 1,
  navigate: 1,
  web_search: 1,
  open_chat: 1,
  reply: 1,
  done: 1,
  click: 2,
  type_text: 2,
  compose_message: 2,
  dial: 2,
  set_alarm: 2,
  set_timer: 2,
  remember: 2,
  send_message: 3,
};

/** Words that make a button press outward-facing or destructive (Hebrew + English). */
const SENSITIVE_WORDS = [
  'שלח', 'שליחה', 'שלחי', 'send',
  'מחק', 'מחיקה', 'מחקי', 'delete', 'remove', 'הסר', 'הסרה', 'הסרת התקנה', 'uninstall',
  'קנה', 'קנייה', 'רכישה', 'רכוש', 'buy', 'purchase', 'checkout', 'order', 'הזמן', 'הזמנה',
  'שלם', 'תשלום', 'pay', 'העבר', 'העברה', 'transfer',
  'אשר', 'אישור', 'confirm', 'accept',
  'פרסם', 'פרסום', 'post', 'publish', 'tweet', 'share', 'שתף', 'שיתוף',
  'התקשר', 'חייג', 'call',
  'חסום', 'block', 'דווח', 'report', 'unsubscribe', 'בטל מנוי', 'התנתק', 'log out', 'logout', 'sign out',
  'reset', 'אפס', 'איפוס', 'format',
];

const BLOCKED_PACKAGE_EXACT = new Set([
  'com.android.settings',
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
  'com.android.vending',
  'com.google.android.apps.walletnfcrel',
  'com.samsung.android.spay',
  'com.paypal.android.p2pmobile',
  'com.bnhp.payments.paymentsapp',
  'com.payboxapp',
  'com.ideomobile.hapoalim',
  'com.leumi.leumiwallet',
  'com.ideomobile.discount',
]);

/** JS mirror of SafetyGuard.kt — used for early, friendlier refusals. Native code is the backstop. */
export function isBlockedPackage(pkg: string | undefined, extra: string[] = []): boolean {
  if (!pkg) return false;
  const p = pkg.toLowerCase();
  if (BLOCKED_PACKAGE_EXACT.has(p) || extra.map((e) => e.toLowerCase()).includes(p)) return true;
  return p.split('.').some(
    (seg) =>
      seg.includes('bank') ||
      seg.includes('wallet') ||
      seg === 'pay' ||
      seg === 'spay' ||
      seg === 'payments' ||
      seg.startsWith('pay') ||
      seg.endsWith('pay'),
  );
}

export function isSensitiveLabel(label: string | undefined): boolean {
  if (!label) return false;
  const l = normalizeText(label).toLowerCase();
  return SENSITIVE_WORDS.some((w) => {
    const word = w.toLowerCase();
    // Hebrew words may carry prefixes (ו/ה/ל) so substring match; English needs a word boundary.
    return /[a-z]/.test(word) ? new RegExp(`\\b${word}\\b`).test(l) : l.includes(word);
  });
}

export function tierOf(action: Action, ctx: PolicyContext = {}): Tier {
  const base = BASE_TIER[action.action];
  if (action.action === 'click') {
    const label = action.text ?? ctx.targetLabel;
    if (isSensitiveLabel(label)) return 3;
  }
  return base;
}

const CHANNEL_NAME = { whatsapp: 'וואטסאפ', sms: 'SMS' } as const;

/** Human-readable description of exactly what is about to happen (shown in approvals). */
export function describeAction(action: Action, ctx: PolicyContext = {}): string {
  switch (action.action) {
    case 'open_app':
      return `לפתוח את ${action.app}`;
    case 'read_screen':
      return 'לקרוא את תוכן המסך';
    case 'scroll':
      return `לגלול ${{ up: 'למעלה', down: 'למטה', left: 'שמאלה', right: 'ימינה' }[action.direction]}`;
    case 'back':
      return 'ללחוץ "חזור"';
    case 'home':
      return 'לחזור למסך הבית';
    case 'wait':
      return `להמתין ${action.ms} מ"ש`;
    case 'navigate':
      return `לנווט אל ${action.destination}`;
    case 'web_search':
      return `לחפש ${action.site === 'youtube' ? 'ביוטיוב' : 'בגוגל'}: ${action.query}`;
    case 'open_chat':
      return `לפתוח שיחת וואטסאפ עם ${action.contact}`;
    case 'click':
      return `ללחוץ על "${action.text ?? ctx.targetLabel ?? `אלמנט ${action.id}`}"`;
    case 'type_text':
      return `להקליד: "${action.text}"`;
    case 'compose_message':
      return `לכתוב (בלי לשלוח) הודעת ${CHANNEL_NAME[action.channel]} ל${action.contact}:\n"${action.message}"`;
    case 'send_message':
      return `לשלוח הודעת ${CHANNEL_NAME[action.channel]} ל${action.contact}:\n"${action.message}"`;
    case 'dial':
      return `לחייג ל${action.contact}`;
    case 'set_alarm':
      return `לכוון שעון מעורר ל-${String(action.hour).padStart(2, '0')}:${String(action.minute).padStart(2, '0')}${action.label ? ` (${action.label})` : ''}`;
    case 'set_timer':
      return `להפעיל טיימר ל-${formatDuration(action.seconds)}`;
    case 'remember':
      return `לזכור ש"${action.alias}" = ${action.value}`;
    case 'reply':
      return action.text;
    case 'done':
      return action.summary;
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h) parts.push(h === 1 ? 'שעה' : `${h} שעות`);
  if (m) parts.push(m === 1 ? 'דקה' : `${m} דקות`);
  if (s) parts.push(`${s} שניות`);
  return parts.join(' ו-') || '0 שניות';
}

/** Decides whether an action may run, needs confirmation, or is refused. */
export function evaluate(action: Action, settings: PolicySettings, ctx: PolicyContext = {}, extraBlocked: string[] = []): Decision {
  const tier = tierOf(action, ctx);
  const uiAction = ['read_screen', 'click', 'type_text', 'scroll'].includes(action.action);

  if (uiAction && !settings.allowUiAutomation) {
    return { kind: 'deny', tier, reason: 'שליטה בממשק (לחיצות/הקלדה) כבויה בהגדרות.' };
  }
  if (uiAction && isBlockedPackage(ctx.foregroundPackage, extraBlocked)) {
    return {
      kind: 'deny',
      tier,
      reason: `Jarvis לא פועל בתוך ${ctx.foregroundPackage} (תשלומים, בנקאות או הגדרות מערכת).`,
    };
  }
  if (tier === 3) {
    return { kind: 'confirm', tier, title: 'לאשר את הפעולה?', details: describeAction(action, ctx) };
  }
  if (tier === 2 && settings.confirmTier2) {
    return { kind: 'confirm', tier, title: 'לבצע?', details: describeAction(action, ctx) };
  }
  return { kind: 'allow', tier };
}
