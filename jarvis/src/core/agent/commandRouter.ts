import type { Action } from '../actions/schema';
import { normalizeText, parseDurationSeconds, parseHebrewNumber, stripFiller } from './hebrew';

/**
 * Fast path: deterministic Hebrew command parsing.
 *
 * Common commands ("פתח וואטסאפ", "שלח לאמא שאני מגיע", "טיימר 5 דקות") are recognised here
 * instantly, without the LLM. This is more reliable than a small on-device model, works before
 * a model is downloaded, and saves battery. Anything not matched goes to the LLM planner.
 *
 * Returns a single action, or null if the command was not recognised.
 */
export function routeCommand(input: string): Action | null {
  const text = stripFiller(input);
  if (!text) return null;

  return (
    matchRemember(text) ??
    matchMessage(text) ??
    matchOpenChat(text) ??
    matchCall(text) ??
    matchAlarm(text) ??
    matchTimer(text) ??
    matchNavigate(text) ??
    matchSearch(text) ??
    matchSimple(text) ??
    matchOpenApp(text)
  );
}

// ---- Messages ---------------------------------------------------------------------------------

const SEND_VERBS = '(?:שלח|תשלח|שלחי|תשלחי)';
const WRITE_VERBS = '(?:כתוב|תכתוב|כתבי|תכתבי|הכן|תכין|נסח|תנסח)';
const TELL_VERBS = '(?:תגיד|תגידי|תודיע|תודיעי|הודע|תמסור|תמסרי)';
const MESSAGE_WORDS =
  "(?:\\s+(?:הודעה|הודעת\\s+(?:וואטסאפ|ווטסאפ|ווצאפ|whatsapp|sms|אס\\s?אם\\s?אס|טקסט)|הודעת|ב?וואטסאפ|ב?ווטסאפ|ב?ווצאפ|ב?whatsapp|sms|ב?אס\\s?אם\\s?אס|מסרון|הודעה\\s+קצרה))*";

function detectChannel(text: string): 'whatsapp' | 'sms' {
  return /(sms|אס\s?אם\s?אס|מסרון|הודעת\s+טקסט|הודעה\s+קצרה)/i.test(text) ? 'sms' : 'whatsapp';
}

/**
 * "שלח לאמא שאני מגיע בעוד חצי שעה"         → send_message(contact=אמא, message=אני מגיע בעוד חצי שעה)
 * "שלח הודעה ליוסי כהן: נפגש ב-8"           → send_message(contact=יוסי כהן, message=נפגש ב-8)
 * "כתוב לדני שאני מאחר"                     → compose_message (opens chat with text, does not send)
 * "תגיד לאבא שאני בדרך"                     → send_message
 * "שלח SMS לרון שהפגישה בוטלה"               → channel=sms
 */
function matchMessage(text: string): Action | null {
  const re = new RegExp(`^(${SEND_VERBS}|${WRITE_VERBS}|${TELL_VERBS})${MESSAGE_WORDS}\\s+(?:אל\\s+)?(.+)$`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const verb = m[1];
  const rest = m[2];

  const split = splitRecipientAndMessage(rest);
  if (!split) return null;

  const isWrite = new RegExp(`^${WRITE_VERBS}$`).test(verb);
  const channel = detectChannel(text);
  return isWrite
    ? { action: 'compose_message', contact: split.contact, message: split.message, channel }
    : { action: 'send_message', contact: split.contact, message: split.message, channel };
}

/** Splits "לאמא שאני מגיע" / "ליוסי כהן: נפגש" / "לדני את ההודעה מה קורה" into recipient + text. */
function splitRecipientAndMessage(rest: string): { contact: string; message: string } | null {
  // Explicit separators first.
  const colon = rest.match(/^(.+?)\s*[:\-–]\s*(.+)$/);
  if (colon) {
    const contact = cleanRecipient(colon[1]);
    if (contact) return { contact, message: colon[2].trim() };
  }
  const quoted = rest.match(/^(.+?)\s+["'](.+)["']$/);
  if (quoted) {
    const contact = cleanRecipient(quoted[1]);
    if (contact) return { contact, message: quoted[2].trim() };
  }
  const explicit = rest.match(/^(.+?)\s+(?:את\s+ה?הודעה|הודעה|את\s+זה)\s*:?\s+(.+)$/);
  if (explicit) {
    const contact = cleanRecipient(explicit[1]);
    if (contact) return { contact, message: explicit[2].trim() };
  }

  const words = rest.split(' ');
  if (words.length < 2) return null;
  // Recipient is 1–2 words; the message starts at the first following word that begins with ש
  // ("שאני מגיע") or with a typical message opener.
  for (let n = 1; n <= Math.min(2, words.length - 1); n++) {
    const next = words[n];
    if (next.startsWith('ש') && next.length > 1) {
      const contact = cleanRecipient(words.slice(0, n).join(' '));
      const message = [next.slice(1), ...words.slice(n + 1)].join(' ').trim();
      if (contact && message) return { contact, message: fixPerspective(message) };
    }
  }
  return null;
}

/** Marker for "him/her" ("כתוב לו", "תגיד לה") — the agent resolves it to the last contact. */
export const LAST_CONTACT = '@last';

function cleanRecipient(raw: string): string {
  const r = raw.trim().replace(/^אל\s+/, '');
  if (/^(לו|לה|להם|להן|אליו|אליה|אליהם)$/.test(r)) return LAST_CONTACT;
  return r.replace(/^ל/, '').trim();
}

/** "שהוא יתקשר אליי" → keep; only fix the common "ש" + pronoun glitches. */
function fixPerspective(message: string): string {
  return message.replace(/^\s+/, '');
}

// ---- Open chat --------------------------------------------------------------------------------

function matchOpenChat(text: string): Action | null {
  const m = text.match(
    /^(?:פתח|תפתח|פתחי|תפתחי|כנס|תכנס|היכנס|תיכנס)\s+(?:לי\s+)?(?:את\s+)?(?:ה)?(?:שיחה|צ'אט|צאט|התכתבות|וואטסאפ|ווטסאפ)\s+(?:בוואטסאפ\s+)?(?:עם|של)\s+(.+)$/,
  );
  if (!m) return null;
  return { action: 'open_chat', contact: m[1].replace(/\s+בוואטסאפ$/, '').trim() };
}

// ---- Calls ------------------------------------------------------------------------------------

function matchCall(text: string): Action | null {
  const m = text.match(/^(?:תתקשר|התקשר|תתקשרי|התקשרי|חייג|תחייג|חייגי|תחייגי|צלצל|תצלצל)\s+(?:בבקשה\s+)?(?:אל\s+|ל)?(.+)$/);
  if (!m) return null;
  const contact = m[1].trim();
  return { action: 'dial', contact: /^(לו|לה|אליו|אליה)$/.test(contact) ? LAST_CONTACT : contact };
}

// ---- Alarm ------------------------------------------------------------------------------------

function matchAlarm(text: string): Action | null {
  const m =
    text.match(/^(?:תעיר|הער|העיר|תעירי)\s+אותי\s+(?:מחר\s+)?(?:ב-?|בשעה\s+)?(.+)$/) ??
    text.match(
      /^(?:קבע|תקבע|כוון|תכוון|שים|תשים|הגדר|תגדיר|הפעל|תפעיל)\s+(?:לי\s+)?(?:שעון\s+מעורר|שעון|התראה|אזעקה|השכמה)\s+(?:מחר\s+)?(?:ל-?|ב-?|לשעה\s+|בשעה\s+)?(.+)$/,
    );
  if (!m) return null;
  const time = parseClock(m[1]);
  if (!time) return null;
  return { action: 'set_alarm', hour: time.hour, minute: time.minute };
}

/** "7", "7:30", "07:05", "שבע", "שבע וחצי", "8 בערב", "רבע לשמונה" → {hour, minute}. */
export function parseClock(raw: string): { hour: number; minute: number } | null {
  let s = normalizeText(raw).replace(/^(ב|ל)-?/, '');
  let pm = false;
  let am = false;
  if (/\s*(בערב|בלילה|אחה"צ|אחר הצהריים|אחרי הצהריים|בצהריים)$/.test(s)) {
    pm = true;
    s = s.replace(/\s*(בערב|בלילה|אחה"צ|אחר הצהריים|אחרי הצהריים|בצהריים)$/, '');
  } else if (/\s*(בבוקר)$/.test(s)) {
    am = true;
    s = s.replace(/\s*בבוקר$/, '');
  }
  s = s.trim();

  let hour: number | null = null;
  let minute = 0;

  const digital = s.match(/^(\d{1,2})(?::|\.)(\d{2})$/);
  const quarterTo = s.match(/^רבע\s+ל(.+)$/);
  if (digital) {
    hour = Number(digital[1]);
    minute = Number(digital[2]);
  } else if (quarterTo) {
    const h = parseHebrewNumber(quarterTo[1]);
    if (h == null) return null;
    hour = h - 1;
    minute = 45;
  } else {
    const parts = s.match(/^(.+?)(?:\s+ו(חצי|רבע|\d{1,2}|\S+))?$/);
    if (!parts) return null;
    hour = parseHebrewNumber(parts[1]);
    if (parts[2]) {
      minute = parts[2] === 'חצי' ? 30 : parts[2] === 'רבע' ? 15 : (parseHebrewNumber(parts[2]) ?? -1);
    }
  }
  if (hour == null || minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  return { hour, minute };
}

// ---- Timer ------------------------------------------------------------------------------------

function matchTimer(text: string): Action | null {
  const m =
    text.match(/^(?:(?:הפעל|תפעיל|שים|תשים|קבע|תקבע|כוון|תכוון)\s+(?:לי\s+)?)?טיימר\s+(?:של\s+|ל-?|למשך\s+)?(.+)$/) ??
    text.match(/^(?:תזכיר\s+לי\s+בעוד|תתריע\s+בעוד)\s+(.+)$/);
  if (!m) return null;
  const seconds = parseDurationSeconds(m[1]);
  if (!seconds) return null;
  return { action: 'set_timer', seconds };
}

// ---- Navigation -------------------------------------------------------------------------------

function matchNavigate(text: string): Action | null {
  const m = text.match(/^(?:נווט|תנווט|נווטי|תנווטי|קח\s+אותי|תיקח\s+אותי|סע|תסע|איך\s+מגיעים)\s+(?:אל\s+|עד\s+)?(.+)$/);
  if (!m) return null;
  let destination = m[1].trim();
  if (/^ל\S/.test(destination) && !/^(לונדון|לוד|לבנון|להבים|לכיש)/.test(destination)) {
    destination = destination.slice(1);
  }
  destination = destination.replace(/\s+(?:בווייז|בוויז|בגוגל\s+מפות|במפות)$/, '');
  return { action: 'navigate', destination };
}

// ---- Search -----------------------------------------------------------------------------------

function matchSearch(text: string): Action | null {
  const yt = text.match(/^(?:חפש|תחפש|חפשי|תחפשי)\s+ב(?:יוטיוב|youtube)\s+(?:את\s+)?(.+)$/i) ??
    text.match(/^(?:חפש|תחפש|חפשי|תחפשי)\s+(.+?)\s+ב(?:יוטיוב|youtube)$/i);
  if (yt) return { action: 'web_search', query: yt[1].trim(), site: 'youtube' };
  const m = text.match(/^(?:חפש|תחפש|חפשי|תחפשי|גגל|תגגל)\s+(?:לי\s+)?(?:בגוגל\s+|באינטרנט\s+|ברשת\s+)?(?:את\s+)?(.+)$/);
  if (!m) return null;
  return { action: 'web_search', query: m[1].replace(/\s+(?:בגוגל|באינטרנט|ברשת)$/, '').trim(), site: 'google' };
}

// ---- Remember ---------------------------------------------------------------------------------

/** "תזכור שאמא זה 050-1234567", "זכור שהבוס הוא דני לוי" → remember(alias, value). */
function matchRemember(text: string): Action | null {
  const m = text.match(/^(?:תזכור|זכור|תזכרי|זכרי|שמור|תשמור)\s+(?:ש)?(.+?)\s+(?:זה|זו|הוא|היא|=|זאת)\s+(.+)$/);
  if (!m) return null;
  return { action: 'remember', alias: m[1].trim(), value: m[2].trim() };
}

// ---- Simple commands --------------------------------------------------------------------------

function matchSimple(text: string): Action | null {
  if (/^(חזור|תחזור|חזרי|אחורה|חזור אחורה|תחזור אחורה)$/.test(text)) return { action: 'back' };
  if (/^(מסך הבית|דף הבית|הביתה|לך הביתה|חזור למסך הבית|תחזור למסך הבית)$/.test(text)) return { action: 'home' };
  if (/^(מה (יש )?על המסך|מה רואים על המסך|קרא (את )?המסך|תקרא (את )?המסך|מה כתוב על המסך)\??$/.test(text)) {
    return { action: 'read_screen' };
  }
  if (/^(גלול|תגלול|גללי) (למטה|מטה)$/.test(text)) return { action: 'scroll', direction: 'down' };
  if (/^(גלול|תגלול|גללי) (למעלה|מעלה)$/.test(text)) return { action: 'scroll', direction: 'up' };
  return null;
}

// ---- Open app (last: it is the most generic pattern) -------------------------------------------

function matchOpenApp(text: string): Action | null {
  const m = text.match(
    /^(פתח|תפתח|פתחי|תפתחי|הפעל|תפעיל|הפעילי|תפעילי|כנס|תכנס|היכנס|תיכנס|הרץ|תריץ)\s+(?:לי\s+)?(?:את\s+)?(?:האפליקציה\s+|אפליקציית\s+|אפליקציה\s+)?(.+)$/,
  );
  if (!m) return null;
  let app = m[2].trim();
  // "כנס לוואטסאפ" — the ל belongs to the verb; "פתח לוח שנה" — it belongs to the name.
  if (/^(כנס|תכנס|היכנס|תיכנס)$/.test(m[1])) app = app.replace(/^ל-?/, '');
  if (!app || app.split(' ').length > 4) return null;
  return { action: 'open_app', app };
}
