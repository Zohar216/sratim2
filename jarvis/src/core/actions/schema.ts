import { z } from 'zod';

/**
 * The complete, closed set of things Jarvis can do. The model never executes anything itself:
 * it may only emit one of these JSON objects, which is then validated here, checked by the
 * security policy and run by the executor.
 *
 * Every action may carry an optional short `thought` (the model's reasoning, shown in the UI).
 */

const thought = z.string().max(300).optional();
const contact = z.string().min(1).max(80);
const channel = z.enum(['whatsapp', 'sms']);

export const ActionSchema = z.discriminatedUnion('action', [
  // ---- Tier 1: harmless --------------------------------------------------------------------
  z.object({ action: z.literal('open_app'), thought, app: z.string().min(1).max(60) }).strict(),
  z.object({ action: z.literal('read_screen'), thought }).strict(),
  z.object({ action: z.literal('scroll'), thought, direction: z.enum(['up', 'down', 'left', 'right']) }).strict(),
  z.object({ action: z.literal('back'), thought }).strict(),
  z.object({ action: z.literal('home'), thought }).strict(),
  z.object({ action: z.literal('wait'), thought, ms: z.number().int().min(100).max(10000) }).strict(),
  z.object({ action: z.literal('navigate'), thought, destination: z.string().min(1).max(120) }).strict(),
  z
    .object({
      action: z.literal('web_search'),
      thought,
      query: z.string().min(1).max(200),
      site: z.enum(['google', 'youtube']).optional(),
    })
    .strict(),
  z.object({ action: z.literal('open_chat'), thought, contact }).strict(),

  // ---- Tier 2: changes something, but reversible / not outward-facing ----------------------
  z
    .object({
      action: z.literal('click'),
      thought,
      id: z.number().int().min(0).max(999).optional(),
      text: z.string().min(1).max(80).optional(),
    })
    .strict()
    .refine((a) => a.id != null || a.text != null, { message: 'click needs id or text' }),
  z
    .object({
      action: z.literal('type_text'),
      thought,
      text: z.string().min(1).max(1000),
      id: z.number().int().min(0).max(999).optional(),
    })
    .strict(),
  z.object({ action: z.literal('compose_message'), thought, contact, message: z.string().min(1).max(1000), channel }).strict(),
  z.object({ action: z.literal('dial'), thought, contact }).strict(),
  z
    .object({
      action: z.literal('set_alarm'),
      thought,
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      label: z.string().max(60).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('set_timer'),
      thought,
      seconds: z.number().int().min(1).max(86400),
      label: z.string().max(60).optional(),
    })
    .strict(),
  z.object({ action: z.literal('remember'), thought, alias: z.string().min(1).max(40), value: z.string().min(1).max(120) }).strict(),

  // ---- Tier 3: outward-facing / irreversible — always needs approval -------------------------
  z.object({ action: z.literal('send_message'), thought, contact, message: z.string().min(1).max(1000), channel }).strict(),

  // ---- Terminal ----------------------------------------------------------------------------
  z.object({ action: z.literal('reply'), thought, text: z.string().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('done'), thought, summary: z.string().max(500) }).strict(),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionName = Action['action'];
export type ActionOf<N extends ActionName> = Extract<Action, { action: N }>;

export const TERMINAL_ACTIONS: ReadonlySet<ActionName> = new Set(['reply', 'done']);

/** Actions that interact with whatever app is on screen (need the accessibility service). */
export const UI_ACTIONS: ReadonlySet<ActionName> = new Set(['read_screen', 'click', 'type_text', 'scroll', 'back', 'home']);

export type ValidationResult = { ok: true; action: Action } | { ok: false; error: string };

/** Validates an unknown value (usually parsed model output) against the action schema. */
export function validateAction(value: unknown): ValidationResult {
  const parsed = ActionSchema.safeParse(value);
  if (parsed.success) return { ok: true, action: parsed.data };
  const issue = parsed.error.issues[0];
  const path = issue?.path?.join('.') || 'action';
  return { ok: false, error: `${path}: ${issue?.message ?? 'invalid'}` };
}

/**
 * JSON Schema handed to llama.cpp for grammar-constrained decoding, so the model can only
 * produce syntactically valid actions. Built by hand (not derived from zod) to keep it small and
 * in the subset llama.cpp's schema→grammar converter supports well.
 */
export function actionJsonSchema(allowUi: boolean): object {
  const str = (maxLength: number) => ({ type: 'string', maxLength });
  const int = (minimum: number, maximum: number) => ({ type: 'integer', minimum, maximum });
  const obj = (name: ActionName, props: Record<string, object>, required: string[] = []) => ({
    type: 'object',
    properties: { thought: str(200), action: { const: name }, ...props },
    required: ['thought', 'action', ...required],
    additionalProperties: false,
  });
  const variants = [
    obj('open_app', { app: str(60) }, ['app']),
    obj('navigate', { destination: str(120) }, ['destination']),
    obj('web_search', { query: str(200), site: { enum: ['google', 'youtube'] } }, ['query']),
    obj('open_chat', { contact: str(80) }, ['contact']),
    obj('compose_message', { contact: str(80), message: str(1000), channel: { enum: ['whatsapp', 'sms'] } }, ['contact', 'message', 'channel']),
    obj('send_message', { contact: str(80), message: str(1000), channel: { enum: ['whatsapp', 'sms'] } }, ['contact', 'message', 'channel']),
    obj('dial', { contact: str(80) }, ['contact']),
    obj('set_alarm', { hour: int(0, 23), minute: int(0, 59), label: str(60) }, ['hour', 'minute']),
    obj('set_timer', { seconds: int(1, 86400), label: str(60) }, ['seconds']),
    obj('remember', { alias: str(40), value: str(120) }, ['alias', 'value']),
    obj('wait', { ms: int(100, 10000) }, ['ms']),
    obj('reply', { text: str(2000) }, ['text']),
    obj('done', { summary: str(500) }, ['summary']),
  ];
  if (allowUi) {
    variants.push(
      obj('read_screen', {}),
      obj('click', { id: int(0, 999), text: str(80) }),
      obj('type_text', { text: str(1000), id: int(0, 999) }, ['text']),
      obj('scroll', { direction: { enum: ['up', 'down', 'left', 'right'] } }, ['direction']),
      obj('back', {}),
      obj('home', {}),
    );
  }
  return { oneOf: variants };
}
