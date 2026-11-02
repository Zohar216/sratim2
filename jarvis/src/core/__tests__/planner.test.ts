import { actionJsonSchema, validateAction } from '../actions/schema';
import { resolveApp } from '../agent/appResolver';
import { buildMessages, parseJsonLoose } from '../agent/planner';

describe('planner helpers', () => {
  it('parses JSON even with code fences or chatter around it', () => {
    expect(parseJsonLoose('{"action":"home"}')).toEqual({ action: 'home' });
    expect(parseJsonLoose('```json\n{"action":"back"}\n```')).toEqual({ action: 'back' });
    expect(parseJsonLoose('Sure! {"action":"reply","text":"שלום"} hope that helps')).toEqual({ action: 'reply', text: 'שלום' });
    expect(parseJsonLoose('not json')).toBeUndefined();
  });

  it('hides UI actions from the grammar when the accessibility service is off', () => {
    const names = (allowUi: boolean) =>
      (actionJsonSchema(allowUi) as { oneOf: { properties: { action: { const: string } } }[] }).oneOf.map((v) => v.properties.action.const);
    expect(names(false)).not.toContain('click');
    expect(names(true)).toEqual(expect.arrayContaining(['click', 'type_text', 'read_screen']));
  });

  it('every grammar variant is accepted by the validator', () => {
    const samples: Record<string, object> = {
      open_app: { app: 'x' }, navigate: { destination: 'x' }, web_search: { query: 'x' }, open_chat: { contact: 'x' },
      compose_message: { contact: 'x', message: 'y', channel: 'sms' }, send_message: { contact: 'x', message: 'y', channel: 'whatsapp' },
      dial: { contact: 'x' }, set_alarm: { hour: 7, minute: 0 }, set_timer: { seconds: 60 }, remember: { alias: 'a', value: 'b' },
      wait: { ms: 500 }, reply: { text: 'x' }, done: { summary: 'x' }, read_screen: {}, click: { id: 3 }, type_text: { text: 'x' },
      scroll: { direction: 'down' }, back: {}, home: {},
    };
    const variants = (actionJsonSchema(true) as { oneOf: { properties: { action: { const: string } } }[] }).oneOf;
    for (const v of variants) {
      const name = v.properties.action.const;
      expect(validateAction({ action: name, thought: 'ok', ...samples[name] })).toEqual(expect.objectContaining({ ok: true }));
    }
  });

  it('includes only the latest screen in the prompt', () => {
    const msgs = buildMessages({
      task: 'בדוק',
      history: [],
      aliases: [],
      uiAvailable: true,
      now: new Date(2026, 10, 2),
      steps: [
        { action: { action: 'read_screen' }, ok: true, result: 'ok', observation: 'OLD_SCREEN' },
        { action: { action: 'scroll', direction: 'down' }, ok: true, result: 'ok', observation: 'NEW_SCREEN' },
      ],
    });
    const all = msgs.map((m) => m.content).join('\n');
    expect(all).toContain('NEW_SCREEN');
    expect(all).not.toContain('OLD_SCREEN');
    expect(msgs[0].role).toBe('system');
  });
});

describe('resolveApp', () => {
  const installed = [
    { label: 'WhatsApp', packageName: 'com.whatsapp' },
    { label: 'מצלמה', packageName: 'com.sec.android.app.camera' },
    { label: 'Spotify', packageName: 'com.spotify.music' },
    { label: 'בנק הפועלים', packageName: 'com.ideomobile.hapoalim' },
  ];
  it.each([
    ['וואטסאפ', 'com.whatsapp'],
    ['WhatsApp', 'com.whatsapp'],
    ['ווצאפ', 'com.whatsapp'],
    ['מצלמה', 'com.sec.android.app.camera'],
    ['ספוטיפיי', 'com.spotify.music'],
    ['הפועלים', 'com.ideomobile.hapoalim'],
  ])('%s → %s', (q, pkg) => expect(resolveApp(q, installed)?.packageName).toBe(pkg));

  it('returns null for apps that are not installed', () => {
    expect(resolveApp('טיקטוק', installed)).toBeNull();
  });
});
