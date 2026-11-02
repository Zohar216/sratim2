import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import { getAlias } from '../memory/repositories';
import { normalizePhone, similarity } from './hebrew';

export type ResolvedContact = { name: string; phone: string };

export type ContactResolution =
  | { ok: true; contact: ResolvedContact }
  | { ok: false; error: string };

const FIELDS = [ContactField.FULL_NAME, ContactField.PHONES] as const;

/**
 * Resolves "אמא" / "יוסי כהן" / "0501234567" to a name + international phone number.
 * Order: direct number → user alias (memory) → device contacts (exact, then fuzzy).
 * Contacts are read on demand only; nothing is copied into Jarvis' own storage.
 */
export async function resolveContact(query: string): Promise<ContactResolution> {
  const q = query.trim();

  const direct = normalizePhone(q);
  if (direct && /^[\d\s+\-()]+$/.test(q)) return { ok: true, contact: { name: q, phone: direct } };

  let searchName = q;
  const alias = await getAlias(q);
  if (alias) {
    const aliasPhone = normalizePhone(alias);
    if (aliasPhone && /^[\d\s+\-()]+$/.test(alias)) return { ok: true, contact: { name: q, phone: aliasPhone } };
    searchName = alias; // alias points to a contact name ("אמא" → "רחל כהן")
  }

  const perm = await requestPermissionsAsync();
  if (perm.status !== 'granted') {
    return { ok: false, error: 'אין הרשאה לאנשי הקשר. אפשר לתת הרשאה בהגדרות, או להגדיר כינוי עם מספר טלפון.' };
  }

  type Row = { fullName?: string | null; phones?: { number?: string; label?: string }[] };
  const pick = (rows: Row[]): ResolvedContact | null => {
    let best: { row: Row; score: number } | null = null;
    for (const row of rows) {
      if (!row.fullName || !row.phones?.length) continue;
      const score = similarity(searchName, row.fullName);
      if (!best || score > best.score) best = { row, score };
    }
    if (!best || best.score < 0.72) return null;
    const phones = best.row.phones ?? [];
    const mobile = phones.find((p) => /mobile|נייד/i.test(p.label ?? '')) ?? phones[0];
    const phone = mobile?.number ? normalizePhone(mobile.number) : null;
    return phone ? { name: best.row.fullName ?? searchName, phone } : null;
  };

  const byName = (await Contact.getAllDetails(FIELDS, { name: searchName, limit: 25 })) as Row[];
  const exact = pick(byName);
  if (exact) return { ok: true, contact: exact };

  const all = (await Contact.getAllDetails(FIELDS, { limit: 3000 })) as Row[];
  const fuzzy = pick(all);
  if (fuzzy) return { ok: true, contact: fuzzy };

  return {
    ok: false,
    error: `לא מצאתי איש קשר בשם "${q}". אפשר ללמד אותי: "תזכור ש${q} זה <שם איש הקשר או מספר>".`,
  };
}
