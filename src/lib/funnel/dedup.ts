import type { Student } from "../../../drizzle/schema";

export type DedupReason =
  | "name_fuzzy"
  | "ig_exact"
  | "phone_last7"
  | "email_normalized"
  | "recent_add";

export interface DedupCandidate {
  studentId: number;
  score: number;
  reasons: DedupReason[];
}

export interface DedupInput {
  firstName: string;
  lastName?: string | null;
  igHandle?: string | null;
  phone?: string | null;
  email?: string | null;
}

export type RosterRow = Pick<
  Student,
  "id" | "firstName" | "lastName" | "igHandle" | "phone" | "email" | "createdAt"
>;

const SCORE_NAME_FUZZY = 60;
const SCORE_IG_EXACT = 90;
const SCORE_PHONE_LAST7 = 80;
const SCORE_EMAIL_NORMALIZED = 95;
const RECENT_ADD_BONUS = 20;
const RECENT_ADD_WINDOW_MS = 24 * 60 * 60 * 1000;
const THRESHOLD = 60;
const MAX_NAME_DISTANCE = 2;

export function findPossibleDuplicates(
  input: DedupInput,
  roster: RosterRow[],
  now: Date
): DedupCandidate[] {
  const inputFirst = (input.firstName ?? "").trim().toLowerCase();
  const inputLast = (input.lastName ?? "").trim().toLowerCase();
  const inputFull = `${inputFirst} ${inputLast}`.trim();
  const inputIg = normalizeIg(input.igHandle);
  const inputPhone7 = phoneLast7(input.phone);
  const inputEmail = normalizeEmail(input.email);

  const candidates = new Map<number, DedupCandidate>();
  const upsert = (id: number, score: number, reason: DedupReason) => {
    const existing = candidates.get(id);
    if (existing) {
      existing.score += score;
      existing.reasons.push(reason);
    } else {
      candidates.set(id, { studentId: id, score, reasons: [reason] });
    }
  };

  for (const r of roster) {
    const rFirst = (r.firstName ?? "").trim().toLowerCase();
    const rLast = (r.lastName ?? "").trim().toLowerCase();
    const rFull = `${rFirst} ${rLast}`.trim();

    if (inputFirst && rFull && levenshtein(inputFull, rFull) <= MAX_NAME_DISTANCE) {
      upsert(r.id, SCORE_NAME_FUZZY, "name_fuzzy");
    }

    const rIg = normalizeIg(r.igHandle);
    if (inputIg && rIg && inputIg === rIg) {
      upsert(r.id, SCORE_IG_EXACT, "ig_exact");
    }

    const rPhone7 = phoneLast7(r.phone);
    if (inputPhone7 && rPhone7 && inputPhone7 === rPhone7) {
      upsert(r.id, SCORE_PHONE_LAST7, "phone_last7");
    }

    const rEmail = normalizeEmail(r.email);
    if (inputEmail && rEmail && inputEmail === rEmail) {
      upsert(r.id, SCORE_EMAIL_NORMALIZED, "email_normalized");
    }
  }

  // Recent-add bonus.
  for (const [id, c] of candidates.entries()) {
    const r = roster.find((x) => x.id === id);
    if (!r) continue;
    const ageMs = now.getTime() - new Date(r.createdAt).getTime();
    if (ageMs >= 0 && ageMs < RECENT_ADD_WINDOW_MS) {
      c.score += RECENT_ADD_BONUS;
      c.reasons.push("recent_add");
    }
  }

  return Array.from(candidates.values())
    .filter((c) => c.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

export function normalizeIg(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function phoneLast7(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-7) : "";
}

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at === -1) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  // strip +tag
  const plus = local.indexOf("+");
  if (plus !== -1) local = local.slice(0, plus);
  // gmail dotless
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
