import type { ScreenNode, ScreenSnapshot } from '../../../modules/jarvis-agent';
import { resolveApp } from '../agent/appResolver';
import type { ResolvedContact } from '../agent/contacts';
import { setAlias } from '../memory/repositories';
import * as device from '../platform/device';
import { formatDuration } from '../security/policy';
import type { Action, ActionOf } from './schema';

/**
 * Executes validated, policy-approved actions.
 *
 * Strategy ("intent first"): whenever Android offers a deep link / intent for a task
 * (open a WhatsApp chat with text, set an alarm, dial, navigate) we use it — it is fast and
 * deterministic. Accessibility clicks are used only where no intent exists (e.g. pressing
 * "send", or operating arbitrary app screens).
 */

export type ExecResult = {
  ok: boolean;
  /** Short Hebrew message for the user. */
  message: string;
  /** Observation for the planner (e.g. serialized screen). Never persisted. */
  observation?: string;
};

export type ExecContext = {
  /** Contact resolved before approval (so the user approved this exact person/number). */
  contact?: ResolvedContact;
  signal?: AbortSignal;
};

const WHATSAPP_PACKAGES = ['com.whatsapp', 'com.whatsapp.w4b'];

export async function execute(action: Action, ctx: ExecContext = {}): Promise<ExecResult> {
  if (ctx.signal?.aborted) return { ok: false, message: 'בוטל.' };
  try {
    switch (action.action) {
      case 'open_app':
        return openApp(action);
      case 'open_chat':
        return openChat(need(ctx.contact));
      case 'compose_message':
        return composeMessage(action, need(ctx.contact));
      case 'send_message':
        return sendMessage(action, need(ctx.contact));
      case 'dial':
        return fromResult(
          await device.openIntent('android.intent.action.DIAL', `tel:+${need(ctx.contact).phone}`, null),
          `פתחתי את החייגן עם המספר של ${need(ctx.contact).name}. לחץ חיוג.`,
        );
      case 'set_alarm':
        return fromResult(
          await device.openIntent('android.intent.action.SET_ALARM', null, {
            'android.intent.extra.alarm.HOUR': action.hour,
            'android.intent.extra.alarm.MINUTES': action.minute,
            'android.intent.extra.alarm.MESSAGE': action.label ?? 'Jarvis',
            'android.intent.extra.alarm.SKIP_UI': true,
          }),
          `כיוונתי שעון מעורר ל-${pad(action.hour)}:${pad(action.minute)}.`,
        );
      case 'set_timer':
        return fromResult(
          await device.openIntent('android.intent.action.SET_TIMER', null, {
            'android.intent.extra.alarm.LENGTH': action.seconds,
            'android.intent.extra.alarm.MESSAGE': action.label ?? 'Jarvis',
            'android.intent.extra.alarm.SKIP_UI': true,
          }),
          `הפעלתי טיימר ל-${formatDuration(action.seconds)}.`,
        );
      case 'navigate':
        return navigate(action.destination);
      case 'web_search':
        return webSearch(action);
      case 'remember':
        await setAlias(action.alias, action.value);
        return { ok: true, message: `אזכור: "${action.alias}" = ${action.value}` };
      case 'read_screen':
        return readScreen();
      case 'click':
        return click(action);
      case 'type_text': {
        const res = await device.setText(action.id ?? null, action.text);
        return fromResult(res, 'הקלדתי את הטקסט.');
      }
      case 'scroll': {
        const res = await device.scroll(action.direction);
        await device.waitForIdle(300, 2000);
        return fromResult(res, 'גללתי.');
      }
      case 'back':
        return fromResult(await device.globalAction('back'), 'חזרתי אחורה.');
      case 'home':
        return fromResult(await device.globalAction('home'), 'חזרתי למסך הבית.');
      case 'wait':
        await device.sleep(action.ms);
        return { ok: true, message: '' };
      case 'reply':
        return { ok: true, message: action.text };
      case 'done':
        return { ok: true, message: action.summary };
    }
  } catch (e) {
    return { ok: false, message: `שגיאה: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function need<T>(v: T | undefined): T {
  if (v == null) throw new Error('איש הקשר לא זוהה');
  return v;
}

const pad = (n: number) => String(n).padStart(2, '0');

function fromResult(res: device.ActionResult, successMessage: string): ExecResult {
  return res.ok ? { ok: true, message: successMessage } : { ok: false, message: res.message || 'הפעולה נכשלה.' };
}

// ---- Apps ---------------------------------------------------------------------------------------

async function openApp(action: ActionOf<'open_app'>): Promise<ExecResult> {
  const installed = await device.getInstalledApps();
  const app = resolveApp(action.app, installed);
  if (!app) return { ok: false, message: `לא מצאתי אפליקציה בשם "${action.app}".` };
  const res = await device.launchApp(app.packageName);
  if (res.ok) await device.waitForIdle(500, 4000);
  return fromResult(res, `פתחתי את ${app.label}.`);
}

// ---- Messaging ----------------------------------------------------------------------------------

function whatsappPackage(): string | undefined {
  return WHATSAPP_PACKAGES.find((p) => device.isAppInstalled(p));
}

async function openWhatsApp(phone: string, text?: string): Promise<device.ActionResult> {
  const url = `https://api.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
  return device.openUrl(url, whatsappPackage());
}

async function openSms(phone: string, text: string): Promise<device.ActionResult> {
  return device.openIntent('android.intent.action.SENDTO', `smsto:+${phone}`, { sms_body: text });
}

async function openChat(contact: ResolvedContact): Promise<ExecResult> {
  const res = await openWhatsApp(contact.phone);
  if (res.ok) await device.waitForIdle(600, 5000);
  return fromResult(res, `פתחתי את השיחה עם ${contact.name}.`);
}

async function composeMessage(action: ActionOf<'compose_message'>, contact: ResolvedContact): Promise<ExecResult> {
  const res = action.channel === 'sms' ? await openSms(contact.phone, action.message) : await openWhatsApp(contact.phone, action.message);
  if (res.ok) await device.waitForIdle(600, 5000);
  return fromResult(res, `ההודעה ל${contact.name} מוכנה בשדה הכתיבה — לא נשלחה.`);
}

/**
 * Opens the chat with the text pre-filled, then presses "send" through the accessibility
 * service and verifies that the input box was cleared. The user already approved the exact
 * recipient + text before we get here.
 */
async function sendMessage(action: ActionOf<'send_message'>, contact: ResolvedContact): Promise<ExecResult> {
  const opened = action.channel === 'sms' ? await openSms(contact.phone, action.message) : await openWhatsApp(contact.phone, action.message);
  if (!opened.ok) return { ok: false, message: opened.message };

  if (!device.isServiceRunning()) {
    return {
      ok: true,
      message: `פתחתי את השיחה עם ${contact.name} וההודעה מוכנה — לחץ "שלח". (כדי שאשלח בעצמי, הפעל את שירות הנגישות של Jarvis.)`,
    };
  }

  // Wait for the chat to appear (WhatsApp can take a moment on a cold start).
  let sendNode: ScreenNode | undefined;
  for (let attempt = 0; attempt < 6 && !sendNode; attempt++) {
    await device.waitForIdle(500, 3000);
    const screen = await device.getScreen();
    sendNode = screen ? findSendButton(screen) : undefined;
    if (!sendNode) await device.sleep(500);
  }
  if (!sendNode) {
    return { ok: false, message: 'השיחה נפתחה אבל לא מצאתי את כפתור השליחה. ההודעה מוכנה — לחץ "שלח" בעצמך.' };
  }

  const clicked = await device.click(sendNode.id);
  if (!clicked.ok) return { ok: false, message: clicked.message };

  // Verify: the compose box should be empty after sending.
  await device.waitForIdle(400, 3000);
  const after = await device.getScreen();
  const input = after?.nodes.find((n) => n.editable);
  if (input && input.text.trim() === action.message.trim()) {
    return { ok: false, message: 'לחצתי על שליחה, אבל נראה שההודעה עדיין בשדה הכתיבה. כדאי לבדוק.' };
  }
  return { ok: true, message: `ההודעה נשלחה ל${contact.name} ✓` };
}

function findSendButton(screen: ScreenSnapshot): ScreenNode | undefined {
  const byId = screen.nodes.find((n) => /^(send|send_btn|send_button|sendbutton|send_message_button.*)$/i.test(n.viewId));
  if (byId) return byId;
  return screen.nodes.find(
    (n) => (n.clickable || n.className.includes('Button')) && /^(שלח|שליחה|send|send message)$/i.test((n.description || n.text).trim()),
  );
}

// ---- Navigation & search -------------------------------------------------------------------------

async function navigate(destination: string): Promise<ExecResult> {
  const q = encodeURIComponent(destination);
  if (device.isAppInstalled('com.waze')) {
    const res = await device.openUrl(`https://waze.com/ul?q=${q}&navigate=yes`, 'com.waze');
    if (res.ok) return { ok: true, message: `מנווט ל${destination} בווייז.` };
  }
  const res = await device.openUrl(`google.navigation:q=${q}`, 'com.google.android.apps.maps');
  if (res.ok) return { ok: true, message: `מנווט ל${destination} במפות.` };
  return fromResult(await device.openUrl(`geo:0,0?q=${q}`), `פתחתי את ${destination} במפה.`);
}

async function webSearch(action: ActionOf<'web_search'>): Promise<ExecResult> {
  const q = encodeURIComponent(action.query);
  if (action.site === 'youtube') {
    return fromResult(
      await device.openUrl(`https://www.youtube.com/results?search_query=${q}`, 'com.google.android.youtube'),
      `מחפש ביוטיוב: ${action.query}`,
    );
  }
  return fromResult(await device.openUrl(`https://www.google.com/search?q=${q}`), `מחפש בגוגל: ${action.query}`);
}

// ---- Screen (accessibility) ------------------------------------------------------------------------

async function readScreen(): Promise<ExecResult> {
  const screen = await device.getScreen();
  if (!screen) return { ok: false, message: 'שירות הנגישות כבוי — אני לא יכול לקרוא את המסך.' };
  if (screen.blocked) return { ok: false, message: 'האפליקציה שעל המסך מוגנת (תשלומים/בנק/הגדרות) — Jarvis לא קורא אותה.' };
  const texts = screen.nodes.map((n) => n.text || n.description).filter(Boolean);
  const summary = texts.slice(0, 12).join(' · ');
  return {
    ok: true,
    message: summary ? `על המסך: ${summary}${texts.length > 12 ? ' …' : ''}` : 'לא מצאתי טקסט על המסך.',
    observation: serializeScreen(screen),
  };
}

async function click(action: ActionOf<'click'>): Promise<ExecResult> {
  const res = action.id != null ? await device.click(action.id) : await device.clickText(action.text ?? '');
  if (res.ok) await device.waitForIdle(400, 3000);
  return fromResult(res, 'לחצתי.');
}

/** Compact, token-efficient screen description for the model. */
export function serializeScreen(screen: ScreenSnapshot, maxChars = 3500): string {
  const lines = [`app: ${screen.packageName}`];
  for (const n of screen.nodes) {
    const label = n.text || n.description || n.hint || n.viewId;
    if (!label && !n.editable) continue;
    const flags = [n.clickable && 'click', n.editable && 'input', n.scrollable && 'scroll', n.checked != null && (n.checked ? 'on' : 'off')]
      .filter(Boolean)
      .join(',');
    const extra = n.text && n.description && n.description !== n.text ? ` (${n.description})` : '';
    lines.push(`[${n.id}] ${n.className}: "${label}"${extra}${flags ? ` {${flags}}` : ''}`);
  }
  if (screen.truncated) lines.push('… (more elements below — scroll to see)');
  let out = lines.join('\n');
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n… (truncated)`;
  return out;
}

/** Looks up the label of a node id in a snapshot (used by the policy to classify clicks). */
export function labelOf(screen: ScreenSnapshot | null, id: number | undefined): string | undefined {
  if (!screen || id == null) return undefined;
  const n = screen.nodes.find((x) => x.id === id);
  return n ? n.text || n.description || n.viewId : undefined;
}
