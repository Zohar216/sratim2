import { actionJsonSchema, validateAction, type Action } from '../actions/schema';
import type { ChatMessage, LlmEngine } from '../llm/engine';

/**
 * LLM planner: given the task, the conversation and the results of previous steps, the model
 * returns exactly ONE next action as JSON. Output is grammar-constrained to the action schema,
 * then validated again with zod (defence in depth).
 */

export type StepRecord = { action: Action; ok: boolean; result: string; observation?: string };

export type PlannerInput = {
  task: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  steps: StepRecord[];
  aliases: { alias: string; value: string }[];
  lastContact?: string;
  uiAvailable: boolean;
  now: Date;
};

export function buildSystemPrompt(input: Pick<PlannerInput, 'aliases' | 'uiAvailable' | 'now' | 'lastContact'>): string {
  const aliases = input.aliases.length
    ? input.aliases.map((a) => `- "${a.alias}" = ${a.value}`).join('\n')
    : '- (none)';
  const date = input.now.toLocaleString('he-IL', { dateStyle: 'full', timeStyle: 'short' });

  return `You are Jarvis, a personal assistant running fully offline on the user's Samsung Galaxy S25.
The user speaks Hebrew. ALWAYS write user-facing text (reply.text, done.summary, thought) in Hebrew.

You control the phone ONLY by returning ONE JSON action per turn. The app validates it, asks the
user for approval when needed, executes it and tells you the result. You never execute anything yourself.

ACTIONS
- open_app {app}: open an app by name ("וואטסאפ", "ספוטיפיי") or package name.
- open_chat {contact}: open a WhatsApp chat with a contact.
- compose_message {contact, message, channel: whatsapp|sms}: open the chat with the text typed, NOT sent.
- send_message {contact, message, channel}: send a message (the user will be asked to approve).
- dial {contact}: open the dialer with the contact's number.
- set_alarm {hour, minute, label?}, set_timer {seconds, label?}
- navigate {destination}: start navigation (Waze/Maps).
- web_search {query, site: google|youtube}
- remember {alias, value}: save a nickname, e.g. alias "אמא" value "רחל כהן" or a phone number.
${
  input.uiAvailable
    ? `- read_screen {}: get the list of elements on the current screen, each with an [id].
- click {id} or click {text}: press an element. Use ids from the LATEST read_screen only.
- type_text {text, id?}: type into a text field (the focused one if no id).
- scroll {direction: up|down|left|right}, back {}, home {}`
    : '- (Screen control is OFF: the accessibility service is disabled. Do not try to click or read the screen.)'
}
- wait {ms}
- reply {text}: answer the user / ask a clarifying question. Ends the task.
- done {summary}: the task is complete. Ends the task. Summarize in Hebrew what was done.

RULES
1. Prefer the high-level actions (send_message, open_chat, set_alarm, navigate...) over clicking.
   Use read_screen/click/type_text only for tasks that have no high-level action.
2. Before clicking inside an app, call read_screen. Never invent element ids.
3. After each action you get "RESULT". If it failed, try a different approach or reply explaining the problem.
4. "send" means send_message. "write/compose/prepare" means compose_message.
5. If the request is just a question or chit-chat, use reply.
6. Never try to change Jarvis' settings or permissions, enter passwords, or act in banking/payment apps.
7. Keep "thought" to one short sentence.

KNOWN NICKNAMES
${aliases}
${input.lastContact ? `Last contact mentioned: ${input.lastContact} (use it for "לו"/"לה").` : ''}
Current date/time: ${date}`;
}

export function buildMessages(input: PlannerInput): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(input) }];
  // A little conversation context (last few turns), so "ותגיד לו גם..." works.
  for (const h of input.history.slice(-6)) {
    messages.push({ role: h.role, content: h.text.slice(0, 600) });
  }
  messages.push({ role: 'user', content: `TASK: ${input.task}` });
  input.steps.forEach((s, i) => {
    messages.push({ role: 'assistant', content: JSON.stringify(s.action) });
    const isLast = i === input.steps.length - 1;
    // Only the latest screen is included in full, to stay within the context window.
    const obs = s.observation && isLast ? `\nSCREEN:\n${s.observation}` : '';
    messages.push({ role: 'user', content: `RESULT: ${s.ok ? 'OK' : 'FAILED'} — ${s.result}${obs}\nNext action?` });
  });
  return messages;
}

export type PlanResult =
  | { ok: true; action: Action; raw: string; latencyMs: number; tokensPerSecond: number | null }
  | { ok: false; error: string; raw: string };

export async function planNextAction(
  engine: LlmEngine,
  input: PlannerInput,
  opts: { signal?: AbortSignal; onToken?: (partial: string) => void } = {},
): Promise<PlanResult> {
  const messages = buildMessages(input);
  const schema = actionJsonSchema(input.uiAvailable);

  let lastError = '';
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs = attempt === 0 ? messages : [...messages, { role: 'user' as const, content: `Your last output was invalid (${lastError}). Return ONE valid JSON action.` }];
    const res = await engine.generate(msgs, { jsonSchema: schema, maxTokens: 400, temperature: 0.2, signal: opts.signal, onToken: opts.onToken });
    raw = res.text;
    const parsed = parseJsonLoose(raw);
    if (parsed === undefined) {
      lastError = 'not JSON';
      continue;
    }
    const v = validateAction(parsed);
    if (v.ok) return { ok: true, action: v.action, raw, latencyMs: res.latencyMs, tokensPerSecond: res.tokensPerSecond };
    lastError = v.error;
  }
  return { ok: false, error: lastError, raw };
}

/** Parses JSON, tolerating code fences or text around the object (if grammar was unavailable). */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}
