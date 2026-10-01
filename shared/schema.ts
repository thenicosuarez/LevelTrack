import { pgTable, text, serial, integer, boolean, timestamp, jsonb, json, real, unique, varchar, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  googleId: text("google_id"), // Google account "sub" claim
  appleId: text("apple_id"), // Sign in with Apple "sub" claim
  streak: integer("streak").default(0),
  totalCompliance: integer("total_compliance").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  // GLP-1 settings
  glp1Drug: text("glp1_drug"),
  glp1Dose: real("glp1_dose"),
  glp1DoseUnit: text("glp1_dose_unit"),
  glp1InjectionFrequency: text("glp1_injection_frequency"), // weekly, biweekly, daily
  glp1InjectionDay: text("glp1_injection_day"), // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  glp1StartDate: text("glp1_start_date"), // YYYY-MM-DD
  goalWeight: real("goal_weight"), // lbs
  weightUnit: text("weight_unit").default("lbs"), // lbs or kg
  // Onboarding & reminders
  hasCompletedOnboarding: boolean("has_completed_onboarding").default(false),
  reminderEnabled: boolean("reminder_enabled").default(false),
  reminderTime: text("reminder_time").default("09:00"), // HH:MM local time
  // Profile
  heightCm: integer("height_cm"), // for BMI calculation
  theme: text("theme").default("light"), // light | dark | system
  timezone: text("timezone"), // IANA zone, e.g. "America/Los_Angeles"; reported by the browser
}, (table) => ({
  // A unique index rather than a constraint so `db:push` can add it to a
  // populated table without prompting to truncate.
  googleIdIdx: uniqueIndex("users_google_id_idx").on(table.googleId),
  appleIdIdx: uniqueIndex("users_apple_id_idx").on(table.appleId),
}));

export const protocols = pgTable("protocols", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // supplements, fasting, exercise, nutrition
  isActive: boolean("is_active").default(true),
  color: text("color").default("#14B8A6"),
  goals: text("goals").array().default([]),
  horsemenTags: text("horsemen_tags").array().default([]), // metabolic, cardiovascular, cancer, neurocognitive
  windowMode: text("window_mode").default("fasting"), // fasting or eating (for TR & IF protocols)
  startDate: text("start_date"), // YYYY-MM-DD format
  createdAt: timestamp("created_at").defaultNow(),
});

export const protocolItems = pgTable("protocol_items", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").references(() => protocols.id).notNull(),
  name: text("name").notNull(),
  
  // Enhanced supplement/nutrition fields
  dosageAmount: real("dosage_amount"), // numerical value like 500, 1000, 2.5
  dosageUnit: text("dosage_unit"), // mg, g, oz, ml, pills, drops, etc.
  formFactor: text("form_factor"), // capsule, powder, injectable, sublingual, dropper, tablet, liquid, etc.
  
  // Cycling information
  cyclingType: text("cycling_type"), // continuous, standard, micro, custom
  onCycleDays: integer("on_cycle_days"), // days in on-cycle phase
  offCycleDays: integer("off_cycle_days"), // days in off-cycle phase
  currentCyclePhase: text("current_cycle_phase"), // on-cycle, wash-out, off-cycle
  cycleStartDate: text("cycle_start_date"), // when current cycle started
  cycleEndDate: text("cycle_end_date"), // when current cycle ends
  
  // Fasting fields
  startTime: text("start_time"), // "08:00"
  endTime: text("end_time"), // "16:00" or null for live tracking
  fastingType: text("fasting_type"), // "goal" or "live"
  
  // Exercise fields
  sets: integer("sets"),
  reps: integer("reps"),
  duration: integer("duration"), // in minutes
  restTime: integer("rest_time"), // in seconds
  weight: integer("weight"), // in lbs/kg
  
  // General fields
  timing: text("timing"), // "08:00", "12:00", etc.
  frequency: text("frequency").default("daily"), // daily, weekly, as_needed
  instructions: text("instructions"),
  order: integer("order").default(0),
  
  // KPI tracking for cycling
  trackingKpis: text("tracking_kpis").array(), // energy, mood, sleep, recovery, etc.
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  protocolId: integer("protocol_id").references(() => protocols.id).notNull(),
  protocolItemId: integer("protocol_item_id").references(() => protocolItems.id).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
});

export const healthMetrics = pgTable("health_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  date: text("date").notNull(),
  sleepHours: integer("sleep_hours"),
  mood: text("mood"), // good, fair, poor
  energy: integer("energy"), // 1-10
  stress: integer("stress"), // 1-10
  weight: real("weight"), // in lbs (float for decimals)
  heartRate: integer("heart_rate"),
  steps: integer("steps"),
  source: text("source"), // oura, myfitnesspal, manual
  rawData: jsonb("raw_data"),
});

export const integrations = pgTable("integrations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  platform: text("platform").notNull(), // oura, myfitnesspal, calai, carbon
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  isActive: boolean("is_active").default(true),
  lastSync: timestamp("last_sync"),
  settings: jsonb("settings"),
});

export const voiceNotes = pgTable("voice_notes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  audioUrl: text("audio_url"), // URL to stored audio file
  transcription: text("transcription"), // AI transcribed text
  aiAnalysis: jsonb("ai_analysis"), // AI analysis and recommendations
  extractedProtocols: jsonb("extracted_protocols"), // parsed protocol data
  processingStatus: text("processing_status").default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

// ─── Push Subscriptions ────────────────────────────────────────────────────

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Login sessions ───────────────────────────────────────────────────────
// Managed by connect-pg-simple; declared here so `db:push` keeps it.

export const sessions = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("IDX_session_expire").on(table.expire),
}));

// ─── LevelTrack GLP-1 Tables ───────────────────────────────────────────────

export const glp1Logs = pgTable("glp1_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  time: text("time").notNull(), // HH:MM
  drugName: text("drug_name").notNull(), // e.g. "Ozempic", "Wegovy"
  formulation: text("formulation"), // pre-filled pen, vial/syringe, auto-injector
  doseAmount: real("dose_amount").notNull(), // e.g. 0.25, 0.5, 2.5
  doseUnit: text("dose_unit").notNull().default("mg"), // mg, mcg, IU, units
  injectionSite: text("injection_site"), // abdomen, thigh, upper-arm, buttocks
  painScore: integer("pain_score"), // 0-10
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sideEffectLogs = pgTable("side_effect_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  nausea: integer("nausea"), // 1-5
  gi: integer("gi"), // GI discomfort 1-5
  fatigue: integer("fatigue"), // 1-5
  mood: integer("mood"), // 1-5
  cravings: integer("cravings"), // 1-5 (lower = fewer cravings)
  sleep: integer("sleep"), // 1-5
  energy: integer("energy"), // 1-5
  freeText: text("free_text"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const progressPhotos = pgTable("progress_photos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  photoUrl: text("photo_url"), // base64 data URL or hosted URL (optional)
  weight: real("weight"), // lbs at time of photo
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Oura Daily Logs ─────────────────────────────────────────────────────

export const ouraDailyLogs = pgTable("oura_daily_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  sleepScore: integer("sleep_score"), // 0-100
  readinessScore: integer("readiness_score"), // 0-100
  hrv: real("hrv"), // average HRV in ms
  totalSleep: integer("total_sleep"), // total sleep in minutes
  deepSleep: integer("deep_sleep"), // deep sleep in minutes
  remSleep: integer("rem_sleep"), // REM sleep in minutes
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userDateUniq: unique().on(table.userId, table.date),
}));

// ─── Peptide Calculator Tables ─────────────────────────────────────────────

export const peptideCalculations = pgTable("peptide_calculations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(), // e.g. "Morning Stack"
  peptides: jsonb("peptides").notNull(), // PeptideEntry[]
  bacWaterMl: real("bac_water_ml").notNull(),
  syringeType: text("syringe_type").notNull().default("U-100"), // "U-100" | "U-40"
  injectionSchedule: text("injection_schedule"), // "daily", "Mon/Wed/Fri", etc.
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vialLogs = pgTable("vial_logs", {
  id: serial("id").primaryKey(),
  calculationId: integer("calculation_id").references(() => peptideCalculations.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  loggedAt: timestamp("logged_at").defaultNow(),
});

// ─── Insert Schemas ────────────────────────────────────────────────────────

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertProtocolSchema = createInsertSchema(protocols).omit({
  id: true,
  createdAt: true,
});

export const insertProtocolItemSchema = createInsertSchema(protocolItems).omit({
  id: true,
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  completedAt: true,
});

export const insertHealthMetricSchema = createInsertSchema(healthMetrics).omit({
  id: true,
});

export const insertIntegrationSchema = createInsertSchema(integrations).omit({
  id: true,
  lastSync: true,
});

export const insertVoiceNoteSchema = createInsertSchema(voiceNotes).omit({
  id: true,
  createdAt: true,
  processedAt: true,
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const symptomScore = z.number().int().min(1).max(5).nullable().optional();

export const insertGlp1LogSchema = createInsertSchema(glp1Logs).omit({
  id: true,
  createdAt: true,
}).extend({
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM"),
  doseAmount: z.number().positive(),
  painScore: z.number().int().min(0).max(10).nullable().optional(),
});

export const insertSideEffectLogSchema = createInsertSchema(sideEffectLogs).omit({
  id: true,
  createdAt: true,
}).extend({
  date: isoDate,
  nausea: symptomScore,
  gi: symptomScore,
  fatigue: symptomScore,
  mood: symptomScore,
  cravings: symptomScore,
  sleep: symptomScore,
  energy: symptomScore,
});

export const updateSideEffectLogSchema = insertSideEffectLogSchema.omit({ userId: true }).partial();

export const insertProgressPhotoSchema = createInsertSchema(progressPhotos).omit({
  id: true,
  createdAt: true,
}).extend({
  date: isoDate,
  photoUrl: z.string().optional(),
  weight: z.number().positive().optional(),
  notes: z.string().optional(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptions).omit({
  id: true,
  createdAt: true,
});

export const insertOuraDailyLogSchema = createInsertSchema(ouraDailyLogs).omit({
  id: true,
  createdAt: true,
});

export const insertPeptideCalculationSchema = createInsertSchema(peptideCalculations).omit({
  id: true,
  createdAt: true,
});

export const insertVialLogSchema = createInsertSchema(vialLogs).omit({
  id: true,
  loggedAt: true,
});

// ─── Types ────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Protocol = typeof protocols.$inferSelect;
export type InsertProtocol = z.infer<typeof insertProtocolSchema>;

export type ProtocolItem = typeof protocolItems.$inferSelect;
export type InsertProtocolItem = z.infer<typeof insertProtocolItemSchema>;

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

export type HealthMetric = typeof healthMetrics.$inferSelect;
export type InsertHealthMetric = z.infer<typeof insertHealthMetricSchema>;

export type Integration = typeof integrations.$inferSelect;
export type InsertIntegration = z.infer<typeof insertIntegrationSchema>;

export type VoiceNote = typeof voiceNotes.$inferSelect;
export type InsertVoiceNote = z.infer<typeof insertVoiceNoteSchema>;

export type Glp1Log = typeof glp1Logs.$inferSelect;
export type InsertGlp1Log = z.infer<typeof insertGlp1LogSchema>;

export type SideEffectLog = typeof sideEffectLogs.$inferSelect;
export type InsertSideEffectLog = z.infer<typeof insertSideEffectLogSchema>;

export type ProgressPhoto = typeof progressPhotos.$inferSelect;
export type InsertProgressPhoto = z.infer<typeof insertProgressPhotoSchema>;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;

// Peptide entry within a calculation
export interface PeptideEntry {
  name: string;
  amountMg: number;
  desiredDoseMcg: number;
}

export type PeptideCalculation = typeof peptideCalculations.$inferSelect;
export type InsertPeptideCalculation = z.infer<typeof insertPeptideCalculationSchema>;

export type VialLog = typeof vialLogs.$inferSelect;
export type InsertVialLog = z.infer<typeof insertVialLogSchema>;

export type OuraDailyLog = typeof ouraDailyLogs.$inferSelect;
export type InsertOuraDailyLog = z.infer<typeof insertOuraDailyLogSchema>;
