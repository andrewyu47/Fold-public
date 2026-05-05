import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findPossibleDuplicates,
  levenshtein,
  normalizeEmail,
  normalizeIg,
  phoneLast7,
  type RosterRow,
} from "../dedup";

const NOW = new Date("2026-09-10T12:00:00Z");

const r = (
  id: number,
  firstName: string,
  lastName?: string,
  extras: Partial<Pick<RosterRow, "igHandle" | "phone" | "email" | "createdAt">> = {}
): RosterRow => ({
  id,
  firstName,
  lastName: lastName ?? null,
  igHandle: extras.igHandle ?? null,
  phone: extras.phone ?? null,
  email: extras.email ?? null,
  createdAt: extras.createdAt ?? new Date("2025-01-01T00:00:00Z"), // long ago
});

test("normalizers", () => {
  assert.equal(normalizeIg("@JordanChen"), "jordanchen");
  assert.equal(normalizeIg("jordanchen"), "jordanchen");
  assert.equal(normalizeIg(null), "");
  assert.equal(phoneLast7("(650) 555-1234"), "5551234");
  assert.equal(phoneLast7("+1 650 555-1234"), "5551234");
  assert.equal(phoneLast7("123"), "");
  assert.equal(normalizeEmail("Jordan.Chen+gym@gmail.com"), "jordanchen@gmail.com");
  assert.equal(normalizeEmail("Jordan.Chen@hotmail.com"), "jordan.chen@hotmail.com");
});

test("levenshtein basics", () => {
  assert.equal(levenshtein("jordan", "jordan"), 0);
  assert.equal(levenshtein("jordan chen", "jordan chen"), 0);
  assert.equal(levenshtein("jordan chen", "jordan cher"), 1);
  assert.equal(levenshtein("jordan chen", "jordaniel chen"), 4);
  assert.equal(levenshtein("sam", "sim"), 1);
});

test("name fuzzy: catches close names within distance 2", () => {
  // "jordan chen" → "jordon chen" (dist 1)
  const out = findPossibleDuplicates(
    { firstName: "Jordan", lastName: "Chen" },
    [r(1, "Jordon", "Chen")],
    NOW
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].reasons.includes("name_fuzzy"));
});

test("Alex vs Alexander NOT caught by name_fuzzy alone (dist 5); caught via IG", () => {
  // "alex" → "alexander" needs 5 edits. Over threshold.
  const noIg = findPossibleDuplicates(
    { firstName: "Alexander", lastName: "Rivera" },
    [r(1, "Alex", "Rivera")],
    NOW
  );
  assert.equal(noIg.length, 0, "name_fuzzy alone shouldn't catch Alex/Alexander");

  // With IG match, server MUST flag it.
  const withIg = findPossibleDuplicates(
    { firstName: "Alexander", lastName: "Rivera", igHandle: "@AlexRivera99" },
    [r(1, "Alex", "Rivera", { igHandle: "alexrivera99" })],
    NOW
  );
  assert.equal(withIg.length, 1);
  assert.ok(withIg[0].reasons.includes("ig_exact"));
  assert.ok(withIg[0].score >= 90);
});

test("IG handle case insensitivity, with and without @", () => {
  const out = findPossibleDuplicates(
    { firstName: "Jordan", igHandle: "@JordanChen" },
    [r(1, "Whoever", undefined, { igHandle: "jordanchen" })],
    NOW
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].reasons.includes("ig_exact"));
});

test("Phone last-7 across formats", () => {
  const out = findPossibleDuplicates(
    { firstName: "Jordan", phone: "(650) 555-1234" },
    [r(1, "J", undefined, { phone: "+16505551234" })],
    NOW
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].reasons.includes("phone_last7"));
});

test("Email normalization: gmail dotless and +tag", () => {
  const out = findPossibleDuplicates(
    { firstName: "Jordan", email: "Jordan.Chen+gym@gmail.com" },
    [r(1, "Jordan", undefined, { email: "jordanchen@gmail.com" })],
    NOW
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].reasons.includes("email_normalized"));
  assert.ok(out[0].score >= 95);
});

test("Recent-add bonus boosts score by 20 when candidate < 24h old", () => {
  const recent = new Date(NOW.getTime() - 30 * 60 * 1000); // 30m ago
  const out = findPossibleDuplicates(
    { firstName: "Alexander", lastName: "Rivera", igHandle: "@alexrivera99" },
    [r(1, "Alex", "Rivera", { igHandle: "alexrivera99", createdAt: recent })],
    NOW
  );
  assert.equal(out.length, 1);
  assert.ok(out[0].reasons.includes("recent_add"));
  assert.ok(out[0].score >= 110, `expected >= 110, got ${out[0].score}`);
});

test("Below threshold not returned", () => {
  // No fuzzy/IG/phone/email match → 0 candidates.
  const out = findPossibleDuplicates(
    { firstName: "Alex", lastName: "Wong" },
    [r(1, "Jordan", "Chen"), r(2, "Sam", "Taylor")],
    NOW
  );
  assert.equal(out.length, 0);
});

test("'Sam Taylor' vs 'Mary Taylor' NOT flagged (first-name dist > 2)", () => {
  const out = findPossibleDuplicates(
    { firstName: "Sam", lastName: "Taylor" },
    [r(1, "Mary", "Taylor")],
    NOW
  );
  // levenshtein("sam taylor", "mary taylor") = 3 → over threshold
  assert.equal(out.length, 0);
});

test("Multiple candidates returned, sorted desc by score", () => {
  const out = findPossibleDuplicates(
    { firstName: "Jordan", lastName: "Chen", igHandle: "jordanchen99" },
    [
      r(1, "Jordan", "Chen", { igHandle: "jordanchen99" }), // name_fuzzy + ig_exact
      r(2, "Jordan", "Chen"), // name_fuzzy only
      r(3, "Alex", "Wong"), // no match
    ],
    NOW
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].studentId, 1);
  assert.ok(out[0].score > out[1].score);
});
