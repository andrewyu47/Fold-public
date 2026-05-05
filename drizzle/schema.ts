import { sqliteTable, text, integer, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  studentId: text("student_id"),
  gender: text("gender", { enum: ["M", "F"] }),
  year: text("year", { enum: ["freshman", "sophomore", "junior", "senior", "grad", "other"] }),
  phone: text("phone"),
  email: text("email"),
  igHandle: text("ig_handle"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  contactedViaIg: integer("contacted_via_ig", { mode: "boolean" }).notNull().default(false),
  primaryContact: text("primary_contact"),
  goals: text("goals"),
  notes: text("notes"),
  courseMaterial: text("course_material", { mode: "json" }).$type<string[]>(),
  // --- WELCOME FUNNEL ---
  addedByUserId: integer("added_by_user_id").references(() => users.id, { onDelete: "set null" }),
  firstMetContext: text("first_met_context"),
  firstMetAt: integer("first_met_at", { mode: "timestamp" }),
  funnelStage: text("funnel_stage", {
    enum: ["new", "reaching_out", "connected", "met", "active", "engaged", "inactive"],
  })
    .notNull()
    .default("new"),
  // --- /WELCOME FUNNEL ---
  // --- HEALTH METRICS ---
  invitedByStudentId: integer("invited_by_student_id").references((): AnySQLiteColumn => students.id, {
    onDelete: "set null",
  }),
  // --- /HEALTH METRICS ---
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type"),
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp" }),
  location: text("location"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const attendances = sqliteTable(
  "attendances",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
    recordedAt: integer("recorded_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    notes: text("notes"),
  },
  (t) => ({
    uniqStudentEvent: uniqueIndex("uniq_student_event").on(t.studentId, t.eventId),
  })
);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  page: text("page"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

// --- WELCOME FUNNEL ---
export const funnelSweepLog = sqliteTable("funnel_sweep_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runAt: integer("run_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  thresholdDays: integer("threshold_days").notNull(),
  evaluated: integer("evaluated").notNull(),
  flippedCount: integer("flipped_count").notNull(),
  flipped: text("flipped", { mode: "json" }).$type<Array<{ studentId: number; from: string }>>(),
  triggeredBy: text("triggered_by", { enum: ["manual", "scheduled"] }).notNull().default("manual"),
});

export const contactAttempts = sqliteTable("contact_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  attemptedByUserId: integer("attempted_by_user_id").references(() => users.id, { onDelete: "set null" }),
  channel: text("channel", { enum: ["ig_dm", "text", "phone", "email", "in_person", "other"] }).notNull(),
  channelDetail: text("channel_detail"),
  attemptedAt: integer("attempted_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  responded: integer("responded", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
// --- /WELCOME FUNNEL ---

export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Attendance = typeof attendances.$inferSelect;
export type User = typeof users.$inferSelect;
export type ContactAttempt = typeof contactAttempts.$inferSelect;
export type NewContactAttempt = typeof contactAttempts.$inferInsert;
export type FunnelStage = NonNullable<Student["funnelStage"]>;
export type FunnelSweepLog = typeof funnelSweepLog.$inferSelect;

// --- RIDES ---
export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  notes: text("notes"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const rideSessions = sqliteTable("ride_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  enforceGenderRule: integer("enforce_gender_rule", { mode: "boolean" }).notNull().default(true),
  recordedBy: integer("recorded_by").references(() => users.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const rides = sqliteTable("rides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rideSessionId: integer("ride_session_id")
    .notNull()
    .references(() => rideSessions.id, { onDelete: "cascade" }),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  vehicleNameSnapshot: text("vehicle_name_snapshot").notNull(),
  capacitySnapshot: integer("capacity_snapshot").notNull(),
  driverName: text("driver_name").notNull(),
  driverStudentId: integer("driver_student_id").references(() => students.id, { onDelete: "set null" }),
  driverGender: text("driver_gender", { enum: ["M", "F"] }),
  notes: text("notes"),
});

export const rideAssignments = sqliteTable(
  "ride_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rideId: integer("ride_id")
      .notNull()
      .references(() => rides.id, { onDelete: "cascade" }),
    rideSessionId: integer("ride_session_id")
      .notNull()
      .references(() => rideSessions.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
  },
  (t) => ({
    uniqSessionStudent: uniqueIndex("uniq_session_student").on(t.rideSessionId, t.studentId),
  })
);

export type Vehicle = typeof vehicles.$inferSelect;
export type NewVehicle = typeof vehicles.$inferInsert;
export type RideSession = typeof rideSessions.$inferSelect;
export type Ride = typeof rides.$inferSelect;
export type RideAssignment = typeof rideAssignments.$inferSelect;
