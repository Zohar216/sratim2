import { NativeModule, requireOptionalNativeModule } from 'expo';

/**
 * Typed bridge to the native "JarvisAgent" module (Android only).
 * Returns `null` on platforms where the module is not compiled in (web, Expo Go, iOS),
 * so the rest of the app can degrade gracefully instead of crashing.
 */

export type ActionResult = { ok: boolean; message: string };

export type ScreenNode = {
  id: number;
  text: string;
  description: string;
  hint: string;
  viewId: string;
  className: string;
  clickable: boolean;
  editable: boolean;
  scrollable: boolean;
  checked: boolean | null;
  focused: boolean;
  password: boolean;
  bounds: [number, number, number, number];
};

export type ScreenSnapshot = {
  packageName: string;
  nodes: ScreenNode[];
  truncated: boolean;
  blocked: boolean;
  serviceEnabled: boolean;
};

export type InstalledApp = { label: string; packageName: string };

type JarvisAgentEvents = {
  onServiceStateChanged: (event: { enabled: boolean }) => void;
  onStopRequested: () => void;
};

declare class JarvisAgentModule extends NativeModule<JarvisAgentEvents> {
  isServiceRunning(): boolean;
  isServiceEnabled(): boolean;
  openAccessibilitySettings(): void;
  setExtraBlockedPackages(packages: string[]): void;
  isPackageBlocked(packageName: string): boolean;

  getInstalledApps(): Promise<InstalledApp[]>;
  isAppInstalled(packageName: string): boolean;
  launchApp(packageName: string): Promise<ActionResult>;
  openIntent(
    action: string,
    data: string | null,
    packageName: string | null,
    extras: Record<string, string | number | boolean> | null,
  ): Promise<ActionResult>;

  getForegroundPackage(): Promise<string>;
  getScreen(): Promise<ScreenSnapshot>;

  click(id: number): Promise<ActionResult>;
  clickText(text: string): Promise<ActionResult>;
  setText(id: number | null, text: string): Promise<ActionResult>;
  scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<ActionResult>;
  globalAction(action: 'back' | 'home' | 'recents' | 'notifications'): Promise<ActionResult>;
  tap(x: number, y: number): Promise<ActionResult>;

  sleep(ms: number): Promise<void>;
  waitForIdle(quietMs: number, timeoutMs: number): Promise<boolean>;

  showStatus(text: string): Promise<void>;
  hideStatus(): Promise<void>;
  requestApproval(title: string, details: string): Promise<boolean>;
  isStopRequested(): boolean;
  requestStop(): void;
  clearStop(): void;
}

export const JarvisAgent = requireOptionalNativeModule<JarvisAgentModule>('JarvisAgent');

export default JarvisAgent;
