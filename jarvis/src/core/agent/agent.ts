import { execute, labelOf, type ExecResult } from '../actions/executor';
import { describeAction, evaluate } from '../security/policy';
import { requestApproval } from '../security/approval';
import { UI_ACTIONS, type Action } from '../actions/schema';
import { getEngine } from '../llm/service';
import { listAliases, logTask, type MessageMeta } from '../memory/repositories';
import * as device from '../platform/device';
import { getState, setState, type LiveStep } from '../../state/store';
import { LAST_CONTACT, routeCommand } from './commandRouter';
import { resolveContact, type ResolvedContact } from './contacts';
import { planNextAction, type StepRecord } from './planner';

/**
 * The agent orchestrator:
 *
 *   user text ─► fast Hebrew router ──(match)──► one action ─┐
 *            └─► LLM planner loop (one action per step) ─────┤
 *                                                            ▼
 *              validate ► resolve contact ► POLICY ► (approval) ► execute ► verify ► next step
 *
 * Every action, from either path, goes through the same policy and executor.
 */

export type TaskOutcome = { reply: string; meta: MessageMeta };

let current: AbortController | null = null;
let lastContact: string | undefined;
let stepCounter = 0;

export function isTaskRunning(): boolean {
  return current != null;
}

/** Emergency stop: aborts planning, pending approvals and native actions. */
export function stopCurrentTask(): void {
  current?.abort();
  device.requestNativeStop();
}

const CONTACT_ACTIONS = new Set(['open_chat', 'compose_message', 'send_message', 'dial']);

export async function runTask(
  text: string,
  history: { role: 'user' | 'assistant'; text: string }[],
): Promise<TaskOutcome> {
  if (current) return { reply: 'אני עדיין באמצע משימה. אפשר לעצור אותה בכפתור "עצור".', meta: { error: true } };

  const controller = new AbortController();
  current = controller;
  device.clearStop();
  const unsubscribeStop = device.onStopRequested(() => controller.abort());
  const started = Date.now();
  setState({ running: true, liveSteps: [], thinking: '' });

  const steps: StepRecord[] = [];
  const meta: MessageMeta = { steps: [] };
  let reply = '';

  try {
    const routed = routeCommand(text);
    if (routed) {
      meta.source = 'router';
      const res = await performAction(routed, controller.signal, steps);
      reply = res.message || (res.ok ? 'בוצע.' : 'הפעולה נכשלה.');
    } else {
      meta.source = 'llm';
      reply = await runPlanner(text, history, controller.signal, steps, meta);
    }
  } catch (e) {
    reply = controller.signal.aborted ? 'עצרתי.' : `משהו השתבש: ${e instanceof Error ? e.message : String(e)}`;
    meta.error = !controller.signal.aborted;
  } finally {
    if (controller.signal.aborted && !reply) reply = 'עצרתי.';
    unsubscribeStop();
    current = null;
    await device.hideStatus().catch(() => {});
    meta.latencyMs = Date.now() - started;
    meta.steps = getState().liveSteps.map((s) => ({ label: s.label, ok: s.status === 'ok', message: s.message }));
    setState({ running: false, thinking: '' });
    // Log action names + outcome only (no screen content, no message bodies).
    void logTask(text, steps.map((s) => s.action.action), reply, meta.latencyMs).catch(() => {});
  }
  return { reply, meta };
}

async function runPlanner(
  task: string,
  history: { role: 'user' | 'assistant'; text: string }[],
  signal: AbortSignal,
  steps: StepRecord[],
  meta: MessageMeta,
): Promise<string> {
  const engine = getEngine();
  if (!engine) {
    return 'לא הבנתי את הפקודה, ומודל ה-AI עוד לא טעון. אפשר לטעון מודל במסך "מודל AI", או לנסות פקודה כמו: "פתח וואטסאפ", "שלח לאמא שאני מגיע", "טיימר 5 דקות".';
  }

  const aliases = await listAliases();
  const maxSteps = getState().settings.maxSteps;
  let failures = 0;

  for (let i = 0; i < maxSteps; i++) {
    if (signal.aborted) return 'עצרתי.';
    setState({ thinking: '…' });
    const plan = await planNextAction(
      engine,
      {
        task,
        history,
        steps,
        aliases,
        lastContact,
        uiAvailable: device.isServiceRunning() && getState().settings.allowUiAutomation,
        now: new Date(),
      },
      { signal, onToken: (t) => setState({ thinking: t }) },
    );
    setState({ thinking: '' });
    if (signal.aborted) return 'עצרתי.';

    if (!plan.ok) {
      return 'המודל לא הצליח לתכנן פעולה תקינה. נסה לנסח אחרת.';
    }
    meta.tokensPerSecond = plan.tokensPerSecond ?? meta.tokensPerSecond;

    const action = plan.action;
    if (action.action === 'reply') return action.text;
    if (action.action === 'done') return action.summary || 'סיימתי.';

    const res = await performAction(action, signal, steps);
    if (res.cancelled) return res.message;
    if (!res.ok) {
      failures++;
      if (failures >= 3) return `לא הצלחתי להשלים את המשימה. ${res.message}`;
    }
  }
  return 'הגעתי למספר הצעדים המרבי בלי לסיים. נסה לפרק את המשימה לחלקים קטנים יותר.';
}

type PerformResult = ExecResult & { cancelled?: boolean };

/** Validated action → contact resolution → policy → approval → execution. */
async function performAction(action: Action, signal: AbortSignal, steps: StepRecord[]): Promise<PerformResult> {
  const stepId = ++stepCounter;
  const settings = getState().settings;
  const step: LiveStep = { id: stepId, label: describeAction(action), status: 'running' };
  pushStep(step);
  void device.showStatus(`Jarvis: ${step.label.split('\n')[0]}`).catch(() => {});

  const finish = (res: PerformResult): PerformResult => {
    updateStep(stepId, { status: res.cancelled ? 'skipped' : res.ok ? 'ok' : 'failed', message: res.message });
    steps.push({ action, ok: res.ok, result: res.message || (res.ok ? 'done' : 'failed'), observation: res.observation });
    return res;
  };

  // 1. Resolve the contact first, so the approval shows the exact person and number.
  let contact: ResolvedContact | undefined;
  if ('contact' in action && CONTACT_ACTIONS.has(action.action)) {
    const name = action.contact === LAST_CONTACT ? lastContact : action.contact;
    if (!name) return finish({ ok: false, message: 'למי? לא ברור לאיזה איש קשר התכוונת.' });
    const resolved = await resolveContact(name);
    if (!resolved.ok) return finish({ ok: false, message: resolved.error });
    contact = resolved.contact;
    lastContact = name;
  }

  // 2. Policy (with the foreground app and the clicked element's label for UI actions).
  const isUi = UI_ACTIONS.has(action.action);
  const foregroundPackage = isUi ? await device.getForegroundPackage() : undefined;
  // Use the snapshot the model saw (not a fresh read) so ids map to the same elements.
  const ctx = { foregroundPackage, targetLabel: action.action === 'click' ? labelOf(device.getLastScreen(), action.id) : undefined };
  const decision = evaluate(action, { confirmTier2: settings.confirmTier2, allowUiAutomation: settings.allowUiAutomation }, ctx, settings.extraBlockedPackages);

  if (decision.kind === 'deny') return finish({ ok: false, message: decision.reason });

  if (decision.kind === 'confirm') {
    updateStep(stepId, { label: `${step.label} — ממתין לאישור` });
    const details = contact ? `${decision.details}\n\nנמען: ${contact.name} (+${contact.phone})` : decision.details;
    const approved = await requestApproval(decision.title, details, signal);
    updateStep(stepId, { label: step.label });
    if (!approved) return finish({ ok: false, cancelled: true, message: signal.aborted ? 'עצרתי.' : 'בוטל — לא אישרת את הפעולה.' });
  }

  if (signal.aborted) return finish({ ok: false, cancelled: true, message: 'עצרתי.' });

  // 3. Execute.
  const res = await execute(action, { contact, signal });
  return finish(res);
}

function pushStep(step: LiveStep): void {
  setState((s) => ({ liveSteps: [...s.liveSteps, step] }));
}

function updateStep(id: number, patch: Partial<LiveStep>): void {
  setState((s) => ({ liveSteps: s.liveSteps.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
}

