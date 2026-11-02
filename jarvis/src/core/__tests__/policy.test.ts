import { validateAction } from '../actions/schema';
import { evaluate, isBlockedPackage, isSensitiveLabel, tierOf } from '../security/policy';

const settings = { confirmTier2: false, allowUiAutomation: true };

describe('security policy', () => {
  it('tier 1 runs without approval', () => {
    expect(evaluate({ action: 'open_app', app: 'וואטסאפ' }, settings).kind).toBe('allow');
  });

  it('sending a message always requires approval', () => {
    const d = evaluate({ action: 'send_message', contact: 'אמא', message: 'מגיע', channel: 'whatsapp' }, settings);
    expect(d.kind).toBe('confirm');
    if (d.kind === 'confirm') expect(d.details).toContain('אמא');
  });

  it('tier 2 asks only when the user enabled it', () => {
    const a = { action: 'type_text', text: 'שלום' } as const;
    expect(evaluate(a, settings).kind).toBe('allow');
    expect(evaluate(a, { ...settings, confirmTier2: true }).kind).toBe('confirm');
  });

  it('clicking a sensitive button escalates to tier 3', () => {
    expect(tierOf({ action: 'click', text: 'שליחה' })).toBe(3);
    expect(tierOf({ action: 'click', id: 4 }, { targetLabel: 'Delete chat' })).toBe(3);
    expect(tierOf({ action: 'click', text: 'הגדרות' })).toBe(2);
  });

  it('refuses UI automation inside banking/payment/system apps', () => {
    for (const pkg of ['com.ideomobile.hapoalim', 'com.bnhp.payments.paymentsapp', 'com.android.settings', 'il.co.somebank.app', 'com.payboxapp']) {
      expect(isBlockedPackage(pkg)).toBe(true);
      expect(evaluate({ action: 'click', text: 'המשך' }, settings, { foregroundPackage: pkg }).kind).toBe('deny');
    }
    for (const pkg of ['com.whatsapp', 'com.spotify.music', 'com.google.android.youtube', 'com.sec.android.app.camera']) {
      expect(isBlockedPackage(pkg)).toBe(false);
    }
  });

  it('opening a banking app is allowed (only operating inside it is blocked)', () => {
    expect(evaluate({ action: 'open_app', app: 'בנק הפועלים' }, settings, { foregroundPackage: 'com.ideomobile.hapoalim' }).kind).toBe('allow');
  });

  it('respects the UI automation switch', () => {
    expect(evaluate({ action: 'scroll', direction: 'down' }, { ...settings, allowUiAutomation: false }).kind).toBe('deny');
  });

  it('detects sensitive labels in Hebrew and English', () => {
    expect(isSensitiveLabel('לשלם עכשיו')).toBe(true);
    expect(isSensitiveLabel('Buy now')).toBe(true);
    expect(isSensitiveLabel('Settings')).toBe(false);
    expect(isSensitiveLabel('display')).toBe(false);
  });
});

describe('action validation', () => {
  it('accepts a valid action', () => {
    expect(validateAction({ action: 'open_app', app: 'com.whatsapp' }).ok).toBe(true);
  });
  it('rejects unknown actions and extra fields', () => {
    expect(validateAction({ action: 'run_shell', cmd: 'rm -rf /' }).ok).toBe(false);
    expect(validateAction({ action: 'open_app', app: 'x', grant: 'all' }).ok).toBe(false);
  });
  it('rejects out-of-range values', () => {
    expect(validateAction({ action: 'set_alarm', hour: 25, minute: 0 }).ok).toBe(false);
    expect(validateAction({ action: 'click' }).ok).toBe(false);
  });
});
