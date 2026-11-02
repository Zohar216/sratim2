import { Linking, Platform } from 'react-native';

import { JarvisAgent, type ActionResult, type InstalledApp, type ScreenSnapshot } from '../../../modules/jarvis-agent';

/**
 * Thin wrapper over the native JarvisAgent module with graceful fallbacks, so the app still
 * runs (with fewer abilities) in Expo Go, on web, or before the accessibility service is enabled.
 */

export const hasNativeAgent = Platform.OS === 'android' && JarvisAgent != null;

const ok: ActionResult = { ok: true, message: '' };
const fail = (message: string): ActionResult => ({ ok: false, message });
const NO_SERVICE = 'שירות הנגישות של Jarvis כבוי. הפעל אותו כדי שאוכל ללחוץ ולהקליד באפליקציות אחרות.';

export function isServiceRunning(): boolean {
  return JarvisAgent?.isServiceRunning() ?? false;
}

export function openAccessibilitySettings(): void {
  if (JarvisAgent) JarvisAgent.openAccessibilitySettings();
  else void Linking.openSettings();
}

let appsCache: { at: number; apps: InstalledApp[] } | null = null;

export async function getInstalledApps(): Promise<InstalledApp[]> {
  if (!JarvisAgent) return [];
  if (appsCache && Date.now() - appsCache.at < 5 * 60_000) return appsCache.apps;
  const apps = await JarvisAgent.getInstalledApps();
  appsCache = { at: Date.now(), apps };
  return apps;
}

export function isAppInstalled(pkg: string): boolean {
  return JarvisAgent?.isAppInstalled(pkg) ?? false;
}

export async function launchApp(pkg: string): Promise<ActionResult> {
  if (!JarvisAgent) return fail('פתיחת אפליקציות דורשת את גרסת ה-Android של Jarvis (development build).');
  return JarvisAgent.launchApp(pkg);
}

/** Opens a URL (deep link). Uses the native module when available so it can target a package. */
export async function openUrl(url: string, packageName?: string): Promise<ActionResult> {
  if (JarvisAgent) {
    const res = await JarvisAgent.openIntent('android.intent.action.VIEW', url, packageName ?? null, null);
    if (res.ok || !packageName) return res;
    // Target app missing — let the system choose.
    return JarvisAgent.openIntent('android.intent.action.VIEW', url, null, null);
  }
  try {
    await Linking.openURL(url);
    return ok;
  } catch (e) {
    return fail(`לא הצלחתי לפתוח את הקישור: ${String(e)}`);
  }
}

export async function openIntent(
  action: string,
  data: string | null,
  extras: Record<string, string | number | boolean> | null,
  packageName: string | null = null,
): Promise<ActionResult> {
  if (JarvisAgent) return JarvisAgent.openIntent(action, data, packageName, extras);
  if (data) return openUrl(data);
  return fail('הפעולה זמינה רק בגרסת ה-Android של Jarvis.');
}

let lastSnapshot: ScreenSnapshot | null = null;

/** Reads the current screen. Element ids stay valid until the next read. */
export async function getScreen(): Promise<ScreenSnapshot | null> {
  if (!JarvisAgent || !JarvisAgent.isServiceRunning()) return null;
  lastSnapshot = await JarvisAgent.getScreen();
  return lastSnapshot;
}

/** The snapshot whose ids the native side currently holds (in memory only). */
export function getLastScreen(): ScreenSnapshot | null {
  return lastSnapshot;
}

export async function getForegroundPackage(): Promise<string> {
  if (!JarvisAgent || !JarvisAgent.isServiceRunning()) return '';
  return JarvisAgent.getForegroundPackage();
}

export async function click(id: number): Promise<ActionResult> {
  if (!isServiceRunning()) return fail(NO_SERVICE);
  return JarvisAgent!.click(id);
}

export async function clickText(text: string): Promise<ActionResult> {
  if (!isServiceRunning()) return fail(NO_SERVICE);
  return JarvisAgent!.clickText(text);
}

export async function setText(id: number | null, text: string): Promise<ActionResult> {
  if (!isServiceRunning()) return fail(NO_SERVICE);
  return JarvisAgent!.setText(id, text);
}

export async function scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<ActionResult> {
  if (!isServiceRunning()) return fail(NO_SERVICE);
  return JarvisAgent!.scroll(direction);
}

export async function globalAction(action: 'back' | 'home'): Promise<ActionResult> {
  if (!isServiceRunning()) return fail(NO_SERVICE);
  return JarvisAgent!.globalAction(action);
}

/**
 * Sleeps using a native timer. JS timers on Android can be throttled while Jarvis is in the
 * background (which is exactly when it is operating another app).
 */
export async function sleep(ms: number): Promise<void> {
  if (JarvisAgent) return JarvisAgent.sleep(ms);
  await new Promise((r) => setTimeout(r, ms));
}

/** Waits until the screen stops changing. Returns false on timeout / no service. */
export async function waitForIdle(quietMs = 500, timeoutMs = 5000): Promise<boolean> {
  if (!isServiceRunning()) {
    await sleep(Math.min(timeoutMs, 1500));
    return false;
  }
  return JarvisAgent!.waitForIdle(quietMs, timeoutMs);
}

export async function showStatus(text: string): Promise<void> {
  if (isServiceRunning()) await JarvisAgent!.showStatus(text);
}

export async function hideStatus(): Promise<void> {
  if (isServiceRunning()) await JarvisAgent!.hideStatus();
}

/** Native overlay approval (works while another app is in front). Throws if unavailable. */
export async function overlayApproval(title: string, details: string): Promise<boolean> {
  if (!isServiceRunning()) throw new Error('NO_OVERLAY');
  return JarvisAgent!.requestApproval(title, details);
}

export function clearStop(): void {
  JarvisAgent?.clearStop();
}

export function requestNativeStop(): void {
  JarvisAgent?.requestStop();
}

export function setExtraBlockedPackages(packages: string[]): void {
  JarvisAgent?.setExtraBlockedPackages(packages);
}

export function onStopRequested(listener: () => void): () => void {
  const sub = JarvisAgent?.addListener('onStopRequested', listener);
  return () => sub?.remove();
}

export function onServiceStateChanged(listener: (enabled: boolean) => void): () => void {
  const sub = JarvisAgent?.addListener('onServiceStateChanged', (e) => listener(e.enabled));
  return () => sub?.remove();
}

export type { ScreenSnapshot, InstalledApp, ActionResult };
