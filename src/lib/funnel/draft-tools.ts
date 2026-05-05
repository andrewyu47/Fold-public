import type Anthropic from "@anthropic-ai/sdk";

export const DRAFT_OUTREACH_TOOL: Anthropic.Tool = {
  name: "draft_outreach_messages",
  description:
    "Generate 2 to 3 short, personal outreach drafts to a member, given everything the organizer knows about them and what the organizer wants to say. Each draft should sound like the ORGANIZER wrote it — warm, casual, specific to this person. NEVER make up facts; only use what's in the provided context.",
  input_schema: {
    type: "object",
    properties: {
      drafts: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        description: "Different angles or tones the organizer could use. Each should be a complete, send-ready message.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "Very short tag describing the angle. e.g. 'Casual check-in', 'Direct invite', 'Reference our last chat'.",
            },
            body: {
              type: "string",
              description: "The actual message body. No greeting padding ('Hey [name]') unless that's how the channel works (e.g. text/IG DM start with the name). Keep IG DMs and texts to 1-3 sentences. Emails can be longer. End with a question or specific ask 80% of the time.",
            },
          },
          required: ["label", "body"],
        },
      },
      explanation: {
        type: "string",
        description: "One short sentence on why you wrote them this way (which signals from the student record you leaned on).",
      },
    },
    required: ["drafts", "explanation"],
  },
};
