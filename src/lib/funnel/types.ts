// Types shared between server (parse + commit) and client UI.

import type { DedupCandidate } from "./dedup";

export type Channel = "ig_dm" | "text" | "phone" | "email" | "in_person" | "other";

export type FunnelStage =
  | "new"
  | "reaching_out"
  | "connected"
  | "met"
  | "active"
  | "engaged"
  | "inactive";

export interface ParsedContact {
  // From Claude:
  match: "existing" | "new";
  studentId?: number;
  firstName?: string;
  lastName?: string;
  gender?: "M" | "F";
  year?: string;
  igHandle?: string;
  phone?: string;
  email?: string;
  firstMetContext?: string;
  attemptedChannel?: Channel;
  attemptedChannelDetail?: string;
  responded?: boolean;
  notes?: string;
  rawText: string;
  // Server-augmented:
  contactId: string; // stable per-row id within the parse, e.g. "row:0"
  existingDisplayName?: string; // when match="existing"
  serverDedupCandidates: DedupCandidateWithName[]; // when match="new"
}

export interface DedupCandidateWithName extends DedupCandidate {
  displayName: string;
  addedByDisplayName?: string;
  createdAt: string; // ISO
}

export interface IntakePreview {
  contacts: ParsedContact[];
  ambiguous: string[];
  explanation: string;
}
