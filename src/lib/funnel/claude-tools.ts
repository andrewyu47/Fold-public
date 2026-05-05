import type Anthropic from "@anthropic-ai/sdk";

export const PARSE_INTAKE_TOOL: Anthropic.Tool = {
  name: "record_intake",
  description:
    "Parse a free-text dump from a group organizer who just met / contacted some people. " +
    "For each person mentioned, decide whether they match an existing roster entry (use studentId) or are brand-new (extract attributes). " +
    "Also capture HOW the organizer met them (firstMetContext) and any contact attempt the organizer described (channel + responded).",
  input_schema: {
    type: "object",
    properties: {
      contacts: {
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
            phone: { type: "string" },
            email: { type: "string" },
            firstMetContext: {
              type: "string",
              description: "Where/how the organizer met them, in their own words. e.g. 'the booth', 'BBQ at the park', 'dorm visit'.",
            },
            attemptedChannel: {
              type: "string",
              enum: ["ig_dm", "text", "phone", "email", "in_person", "other"],
              description: "If the organizer described a contact attempt, which channel. 'in_person' for booth/BBQ/dorm meetups.",
            },
            attemptedChannelDetail: {
              type: "string",
              description: "Optional: who/what/where for the channel. e.g. 'told her I'd see her at the event' for in_person.",
            },
            responded: {
              type: "boolean",
              description: "If the organizer said the person did or didn't reply/show. Omit if not stated.",
            },
            notes: { type: "string" },
            rawText: {
              type: "string",
              description: "The exact substring from the input that produced this contact.",
            },
          },
          required: ["match", "rawText"],
        },
      },
      explanation: {
        type: "string",
        description: "One short sentence summarizing what you understood the organizer to be saying.",
      },
      ambiguous: {
        type: "array",
        items: { type: "string" },
        description: "Names that match 0 or 2+ roster entries — leave for the organizer to resolve.",
      },
    },
    required: ["contacts"],
  },
};
