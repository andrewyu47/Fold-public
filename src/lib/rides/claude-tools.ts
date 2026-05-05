import type Anthropic from "@anthropic-ai/sdk";

export const PROPOSE_FLEET_TOOL: Anthropic.Tool = {
  name: "propose_fleet",
  description:
    "Parse a free-text description of which vehicles and drivers will be used for a carpool. Match each vehicle against the saved fleet when possible; otherwise mark as ad_hoc. Use the saved capacity unless the organizer explicitly specified a different number. Drivers may be referenced by first name only — match against the roster by fuzzy name + nickname (Mike/Michael, Jess/Jessica). Capture driver gender from any explicit hints ('Sarah's car' implies Sarah drives, gender F if she's a roster F).",
  input_schema: {
    type: "object",
    properties: {
      vehicles: {
        type: "array",
        description: "Every vehicle the organizer mentioned for use. Order doesn't matter.",
        items: {
          type: "object",
          properties: {
            match: { type: "string", enum: ["saved", "ad_hoc"] },
            savedVehicleId: {
              type: "number",
              description: "id from saved fleet. Required when match='saved'.",
            },
            name: {
              type: "string",
              description: "Display name for the vehicle. If matched to saved, prefer the saved name.",
            },
            capacity: {
              type: "number",
              description: "Passenger capacity EXCLUDING the driver. Use saved capacity for matched vehicles unless organizer specified different.",
            },
            driverName: {
              type: "string",
              description: "Driver's display name. Required.",
            },
            driverStudentId: {
              type: "number",
              description: "If the driver matches a roster student, their id. Optional.",
            },
            driverGender: {
              type: "string",
              enum: ["M", "F"],
              description: "Driver gender if known from roster match or explicit cue.",
            },
            rawText: {
              type: "string",
              description: "The exact substring from the input that produced this vehicle.",
            },
          },
          required: ["match", "name", "capacity", "driverName", "rawText"],
        },
      },
      ambiguousVehicleNames: {
        type: "array",
        description: "Vehicle names that match 0 or 2+ saved vehicles — leave for the organizer to resolve.",
        items: { type: "string" },
      },
      explanation: {
        type: "string",
        description: "One short sentence summarizing the proposed fleet.",
      },
    },
    required: ["vehicles", "explanation"],
  },
};

export const PROPOSE_RIDE_PLAN_TOOL: Anthropic.Tool = {
  name: "propose_ride_plan",
  description:
    "Parse a free-text list of riders for a carpool, resolving names against the existing student roster, and extract any soft directives the organizer expressed in natural language (group X with Y, balance freshmen, pin person to a specific car, etc). " +
    "DO NOT decide final seating yourself — return only parsed riders + structured directives. A deterministic solver will assign seats.",
  input_schema: {
    type: "object",
    properties: {
      riders: {
        type: "array",
        description: "Every person mentioned as a rider in the input (excluding drivers, who are listed separately by the organizer).",
        items: {
          type: "object",
          properties: {
            match: { type: "string", enum: ["existing", "new"] },
            studentId: { type: "number", description: "Required when match='existing'. The id from the roster." },
            firstName: { type: "string" },
            lastName: { type: "string" },
            gender: { type: "string", enum: ["M", "F"] },
            year: {
              type: "string",
              enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"],
            },
            phone: { type: "string" },
            notes: { type: "string" },
            rawText: {
              type: "string",
              description: "The exact substring from the input that produced this rider.",
            },
          },
          required: ["match", "rawText"],
        },
      },
      directives: {
        type: "object",
        description: "Soft preferences extracted from the organizer's natural-language hints. Use studentIds when possible. The solver will honor these where it can without violating hard constraints.",
        properties: {
          groupTogether: {
            type: "array",
            description: "Each inner array is a group of student IDs the organizer wants seated in the same car if possible.",
            items: { type: "array", items: { type: "number" } },
          },
          keepApart: {
            type: "array",
            description: "Each inner array is a group of student IDs that should be in DIFFERENT cars if possible.",
            items: { type: "array", items: { type: "number" } },
          },
          prioritize: {
            type: "array",
            description: "Student IDs to seat first if seats are tight.",
            items: { type: "number" },
          },
          pinned: {
            type: "array",
            description: "Hard placements: 'put X in car Y'. The solver will treat these as required when feasible.",
            items: {
              type: "object",
              properties: {
                studentId: { type: "number" },
                vehicleId: { type: "number" },
              },
              required: ["studentId", "vehicleId"],
            },
          },
          balance: {
            type: "boolean",
            description: "True if the organizer said something like 'balance freshmen' / 'spread the new people' / 'mix it up'.",
          },
          enforceGenderRule: {
            type: "boolean",
            description: "True if the organizer mentions gender safety, no one alone with the opposite gender, or enforcing a gender rule. Default false.",
          },
        },
      },
      ambiguous: {
        type: "array",
        description: "Names from the input that match 0 or 2+ students — leave for the organizer to resolve.",
        items: { type: "string" },
      },
      explanation: {
        type: "string",
        description: "One short sentence summarizing what you understood the organizer to be asking for.",
      },
    },
    required: ["riders", "explanation"],
  },
};
