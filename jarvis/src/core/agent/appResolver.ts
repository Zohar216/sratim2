import { looseKey, similarity } from './hebrew';

export type AppEntry = { label: string; packageName: string };

/**
 * Common app names (Hebrew, English, slang) → Android package. Samsung packages are listed
 * first where Samsung ships its own app (Galaxy S25 defaults).
 */
const KNOWN_APPS: { names: string[]; packages: string[] }[] = [
  { names: ['וואטסאפ', 'ווטסאפ', 'ווצאפ', 'וואצאפ', 'whatsapp', 'וטסאפ'], packages: ['com.whatsapp', 'com.whatsapp.w4b'] },
  { names: ['ווייז', 'וויז', 'waze'], packages: ['com.waze'] },
  { names: ['יוטיוב', 'youtube'], packages: ['com.google.android.youtube'] },
  { names: ['יוטיוב מיוזיק', 'youtube music'], packages: ['com.google.android.apps.youtube.music'] },
  { names: ['ספוטיפיי', 'ספוטיפי', 'spotify'], packages: ['com.spotify.music'] },
  { names: ['מצלמה', 'camera'], packages: ['com.sec.android.app.camera', 'com.google.android.GoogleCamera'] },
  { names: ['גלריה', 'תמונות', 'gallery', 'photos'], packages: ['com.sec.android.gallery3d', 'com.google.android.apps.photos'] },
  { names: ['גוגל פוטוס', 'google photos'], packages: ['com.google.android.apps.photos'] },
  { names: ['כרום', 'chrome', 'דפדפן'], packages: ['com.android.chrome', 'com.sec.android.app.sbrowser'] },
  { names: ['סמסונג אינטרנט', 'samsung internet'], packages: ['com.sec.android.app.sbrowser'] },
  { names: ['מפות', 'גוגל מפות', 'google maps', 'maps'], packages: ['com.google.android.apps.maps'] },
  { names: ['ג׳ימייל', "ג'ימייל", 'גימייל', 'gmail', 'מייל', 'דואר'], packages: ['com.google.android.gm'] },
  { names: ['יומן', 'לוח שנה', 'calendar'], packages: ['com.samsung.android.calendar', 'com.google.android.calendar'] },
  { names: ['שעון', 'clock', 'שעון מעורר'], packages: ['com.sec.android.app.clockpackage', 'com.google.android.deskclock'] },
  { names: ['מחשבון', 'calculator'], packages: ['com.sec.android.app.popupcalculator', 'com.google.android.calculator'] },
  { names: ['אנשי קשר', 'contacts'], packages: ['com.samsung.android.app.contacts', 'com.google.android.contacts'] },
  { names: ['טלפון', 'חייגן', 'phone', 'dialer'], packages: ['com.samsung.android.dialer', 'com.google.android.dialer'] },
  { names: ['הודעות', 'messages', 'sms'], packages: ['com.samsung.android.messaging', 'com.google.android.apps.messaging'] },
  { names: ['הגדרות', 'settings'], packages: ['com.android.settings'] },
  { names: ['פלי סטור', 'פליי סטור', 'חנות', 'play store'], packages: ['com.android.vending'] },
  { names: ['אינסטגרם', 'אינסטה', 'instagram'], packages: ['com.instagram.android'] },
  { names: ['פייסבוק', 'facebook'], packages: ['com.facebook.katana'] },
  { names: ['מסנג׳ר', "מסנג'ר", 'messenger'], packages: ['com.facebook.orca'] },
  { names: ['טלגרם', 'telegram'], packages: ['org.telegram.messenger'] },
  { names: ['טיקטוק', 'tiktok'], packages: ['com.zhiliaoapp.musically'] },
  { names: ['נטפליקס', 'netflix'], packages: ['com.netflix.mediaclient'] },
  { names: ['מוביט', 'moovit'], packages: ['com.tranzmate'] },
  { names: ['גט', 'gett'], packages: ['com.gettaxi.android'] },
  { names: ['וולט', 'wolt'], packages: ['com.wolt.android'] },
  { names: ['אקס', 'טוויטר', 'twitter', 'x'], packages: ['com.twitter.android'] },
  { names: ['לינקדאין', 'linkedin'], packages: ['com.linkedin.android'] },
  { names: ['סמסונג הלת׳', "סמסונג הלת'", 'samsung health', 'בריאות'], packages: ['com.sec.android.app.shealth'] },
  { names: ['הקבצים שלי', 'קבצים', 'my files', 'files'], packages: ['com.sec.android.app.myfiles', 'com.google.android.documentsui'] },
  { names: ['פתקים', 'סמסונג נוטס', 'samsung notes', 'notes'], packages: ['com.samsung.android.app.notes'] },
  { names: ['ג׳מיני', "ג'מיני", 'gemini'], packages: ['com.google.android.apps.bard'] },
  { names: ['זום', 'zoom'], packages: ['us.zoom.videomeetings'] },
];

export type ResolvedApp = { packageName: string; label: string; confidence: number };

/**
 * Resolves a spoken/typed app name to an installed package.
 * Order: package name given directly → known names → installed app labels (fuzzy).
 */
export function resolveApp(query: string, installed: AppEntry[]): ResolvedApp | null {
  const q = query.trim();
  if (!q) return null;
  const installedSet = new Set(installed.map((a) => a.packageName));
  const isInstalled = (pkg: string) => installed.length === 0 || installedSet.has(pkg);

  // 1. Looks like a package name already.
  if (/^[a-z][\w]*(\.[\w]+)+$/i.test(q) && isInstalled(q)) {
    return { packageName: q, label: installed.find((a) => a.packageName === q)?.label ?? q, confidence: 1 };
  }

  // 2. Known names.
  const key = looseKey(q);
  for (const entry of KNOWN_APPS) {
    if (entry.names.some((n) => looseKey(n) === key)) {
      const pkg = entry.packages.find(isInstalled);
      if (pkg) {
        return { packageName: pkg, label: installed.find((a) => a.packageName === pkg)?.label ?? entry.names[0], confidence: 1 };
      }
    }
  }

  // 3. Fuzzy over installed labels (Samsung shows Hebrew labels when the phone is in Hebrew).
  let best: ResolvedApp | null = null;
  const queryWords = q.split(/\s+/).map(looseKey).filter(Boolean);
  for (const app of installed) {
    const labelWords = app.label.split(/\s+/).map(looseKey);
    // "הפועלים" → "בנק הפועלים": every spoken word is a whole word of the label.
    const wordMatch = queryWords.length > 0 && queryWords.every((w) => labelWords.includes(w)) ? 0.9 : 0;
    const score = Math.max(similarity(q, app.label), wordMatch);
    if (!best || score > best.confidence) best = { packageName: app.packageName, label: app.label, confidence: score };
  }
  // Fuzzy over known aliases too ("ווצאפ" typo, etc.)
  for (const entry of KNOWN_APPS) {
    for (const n of entry.names) {
      const score = similarity(q, n) * 0.95;
      const pkg = entry.packages.find(isInstalled);
      if (pkg && (!best || score > best.confidence)) {
        best = { packageName: pkg, label: installed.find((a) => a.packageName === pkg)?.label ?? entry.names[0], confidence: score };
      }
    }
  }
  return best && best.confidence >= 0.72 ? best : null;
}
