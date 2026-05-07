import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const MODEL = "claude-sonnet-4-6";

export const PARSE_ATTENDANCE_TOOL: Anthropic.Tool = {
  name: "record_attendees",
  description:
    "Record the list of attendees parsed from the user's free-text input. " +
    "For each name, decide whether they match an existing student in the provided roster (use the studentId) or are a brand-new person (extract any attributes mentioned).",
  input_schema: {
    type: "object",
    properties: {
      attendees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            match: { type: "string", enum: ["existing", "new"] },
            studentId: {
              type: "number",
              description: "Required when match='existing'. The id from the roster.",
            },
            firstName: { type: "string" },
            lastName: { type: "string" },
            gender: { type: "string", enum: ["M", "F"] },
            year: {
              type: "string",
              enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"],
            },
            igHandle: { type: "string", description: "Instagram handle without @" },
            memberStatus: { type: "string", enum: ["prospect", "member", "core"] },
            notes: { type: "string" },
            rawText: {
              type: "string",
              description: "The exact substring from the input that produced this attendee.",
            },
          },
          required: ["match", "rawText"],
        },
      },
    },
    required: ["attendees"],
  },
};

export const PROPOSE_EVENT_BATCH_TOOL: Anthropic.Tool = {
  name: "propose_event_with_attendees",
  description:
    "Extract a proposed event (name, date, type, location) AND the list of attendees from a single free-text input. Use when the user wants to create an event and mark people present in one shot.",
  input_schema: {
    type: "object",
    properties: {
      event: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Short, normalized event name. e.g. 'Weekly 5/1' for 'weekly 5/1 event', 'Boba and Boardgames' for 'boba night'.",
          },
          date: {
            type: "string",
            description:
              "ISO date YYYY-MM-DD. If only month/day given, use the current year. If words like 'last Friday' are used, resolve from today's date.",
          },
          type: {
            type: "string",
            description:
              "Event type like Weekly, Social, General, Workshop, Hangout, Study Group. Infer from the event name when possible.",
          },
          location: { type: "string", description: "Location if mentioned, otherwise leave empty." },
          isNew: {
            type: "boolean",
            description:
              "True if the user explicitly said 'new' (e.g. 'new Weekly 5/1') — meaning create this event even if a similar one might exist.",
          },
        },
        required: ["name", "date", "isNew"],
      },
      attendees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            match: { type: "string", enum: ["existing", "new"] },
            studentId: { type: "number" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            gender: { type: "string", enum: ["M", "F"] },
            year: {
              type: "string",
              enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"],
            },
            igHandle: { type: "string" },
            memberStatus: { type: "string", enum: ["prospect", "member", "core"] },
            invitedByName: {
              type: "string",
              description:
                "If the organizer said this person was 'brought by X', 'invited by X', 'X's friend', 'came with X', etc., capture the inviter's name verbatim. Server resolves to a roster id via the same fuzzy match. Leave empty if not stated.",
            },
            notes: { type: "string" },
            rawText: { type: "string" },
          },
          required: ["match", "rawText"],
        },
      },
    },
    required: ["event", "attendees"],
  },
};

export const PROPOSE_EVENT_BATCH_LIST_TOOL: Anthropic.Tool = {
  name: "propose_event_batch_list",
  description:
    "Use ONLY when the organizer wants to create MULTIPLE events in one shot WITHOUT specifying attendees per event. " +
    "Examples: 'create the next 4 weekly meeting dates', 'add Hangout Saturday and Study Group Tuesday', 'schedule social 5/3 5/10 5/17'. " +
    "If the organizer is creating ONE event and listing attendees for it, use propose_event_with_attendees instead.",
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        minItems: 2,
        description: "The list of events to create. Two or more.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Short, normalized event name. e.g. 'Weekly 5/1' for 'weekly may 1', 'Boba and Boardgames' for 'boba night'.",
            },
            date: {
              type: "string",
              description: "ISO date YYYY-MM-DD. If only month/day given, use the current year. If 'next Friday', resolve from today.",
            },
            type: {
              type: "string",
              description: "Event type like Weekly, Social, General, Workshop, Hangout, Study Group. Infer from the event name when possible.",
            },
            location: {
              type: "string",
              description: "Location if mentioned. Apply a location mentioned at the top of the input to ALL events that don't have their own location.",
            },
          },
          required: ["name", "date"],
        },
      },
    },
    required: ["events"],
  },
};

export const UPDATE_STUDENTS_TOOL: Anthropic.Tool = {
  name: "update_students",
  description:
    "Apply targeted edits to one or more students. The roster is provided for disambiguation. Resolve names from the roster — if a name is ambiguous (multiple matches) or not in the roster, list it under `ambiguous` instead of guessing.",
  input_schema: {
    type: "object",
    properties: {
      updates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            studentId: { type: "number", description: "The student id from the roster." },
            patch: {
              type: "object",
              description: "Fields to set. Omit fields that should not change.",
              properties: {
                firstName: { type: "string" },
                lastName: { type: "string" },
                gender: { type: "string", enum: ["M", "F"] },
                year: {
                  type: "string",
                  enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"],
                },
                phone: { type: "string" },
                email: { type: "string" },
                igHandle: { type: "string", description: "Without leading @" },
                memberStatus: { type: "string", enum: ["prospect", "member", "core"] },
                isActive: { type: "boolean" },
                contactedViaIg: { type: "boolean" },
                primaryContact: { type: "string" },
                goals: { type: "string" },
                notes: { type: "string", description: "REPLACES the existing notes." },
                notesAppend: {
                  type: "string",
                  description:
                    "APPENDS to the existing notes (preferred for short observations like 'mentioned baptism interest 5/1').",
                },
              },
            },
          },
          required: ["studentId", "patch"],
        },
      },
      explanation: {
        type: "string",
        description: "One short sentence summarizing what you understood the user to be asking for.",
      },
      ambiguous: {
        type: "array",
        items: { type: "string" },
        description: "Names from the input that match 0 or 2+ students — leave for the user to resolve.",
      },
      creates: {
        type: "array",
        description:
          "Brand-new students to add to the database. Use when the user says 'add', 'create', or 'new student' for someone NOT in the roster. Extract any attributes mentioned (name, year, gender, status, IG, phone, etc.).",
        items: {
          type: "object",
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            gender: { type: "string", enum: ["M", "F"] },
            year: {
              type: "string",
              enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"],
            },
            phone: { type: "string" },
            email: { type: "string" },
            igHandle: { type: "string", description: "Without leading @" },
            memberStatus: { type: "string", enum: ["prospect", "member", "core"] },
            primaryContact: { type: "string" },
            notes: { type: "string" },
          },
          required: ["firstName"],
        },
      },
      deletes: {
        type: "array",
        description:
          "Students the user wants to permanently remove. Use ONLY when the user explicitly says 'delete', 'remove', 'get rid of' a person from the database. This cascades to wipe their attendance history. If the user says 'mark inactive' or 'they stopped coming', that's an update with isActive=false, NOT a delete.",
        items: {
          type: "object",
          properties: {
            studentId: { type: "number" },
            reason: { type: "string", description: "Short reason from the user (e.g. 'duplicate', 'wrong entry')." },
          },
          required: ["studentId"],
        },
      },
    },
    required: ["updates", "explanation"],
  },
};

export const EVENT_INSIGHTS_TOOL: Anthropic.Tool = {
  name: "report_event_insights",
  description:
    "Produce 3-5 short bullet hypotheses for what drove attendance. Anchor each bullet in the supplied numbers (cite avg attendance gaps and bucket sizes). Do not invent factors not present in the data. If a bucket has too few events, say so or skip it.",
  input_schema: {
    type: "object",
    properties: {
      insights: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            headline: {
              type: "string",
              description: "Punchy one-line claim (e.g., 'Free food correlates with +8 attendees on average').",
            },
            evidence: {
              type: "string",
              description: "One short sentence citing the numbers from the aggregate (e.g., 'avg 14 with food vs 6 without across 5 vs 3 events').",
            },
          },
          required: ["headline", "evidence"],
        },
      },
    },
    required: ["insights"],
  },
};

export const NL_QUERY_TOOL: Anthropic.Tool = {
  name: "query_students",
  description:
    "Build a structured filter spec to find students. The server translates this into safe parameterized SQL.",
  input_schema: {
    type: "object",
    properties: {
      filters: {
        type: "object",
        properties: {
          gender: { type: "string", enum: ["M", "F"] },
          year: {
            type: "array",
            items: {
              type: "string",
              enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"],
            },
          },
          memberStatus: {
            type: "array",
            items: { type: "string", enum: ["prospect", "member", "core"] },
          },
          isActive: { type: "boolean" },
          contactedViaIg: { type: "boolean" },
          attendedEventNameContains: {
            type: "string",
            description: "Match students who attended any event whose name contains this substring (case-insensitive).",
          },
          notAttendedSinceDays: {
            type: "number",
            description: "Match students whose most recent attendance is older than N days (or have no attendance).",
          },
          attendedAtLeast: {
            type: "number",
            description: "Match students who have attended at least this many events.",
          },
          nameContains: { type: "string" },
          primaryContactContains: { type: "string" },
        },
      },
      explanation: {
        type: "string",
        description: "One short sentence explaining what filter you applied for the user.",
      },
    },
    required: ["filters", "explanation"],
  },
};
