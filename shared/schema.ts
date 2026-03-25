import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  streak: integer("streak").default(0),
  totalCompliance: integer("total_compliance").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  // GLP-1 settings
  glp1Drug: text("glp1_drug"),
  glp1Dose: real("glp1_dose"),
  glp1DoseUnit: text("glp1_dose_unit"),
  glp1InjectionDay: text("glp1_injection_day"), // Mon, Tue, Wed, Thu, Fri, Sat, Sun
  glp1StartDate: text("glp1_start_date"), // YYYY-MM-DD
  goalWeight: real("goal_weight"), // lbs
  weightUnit: text("weight_unit").default("lbs"), // lbs or kg
});

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
  dosageAmount: integer("dosage_amount"), // numerical value like 500, 1000, 2
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

export const insertGlp1LogSchema = createInsertSchema(glp1Logs).omit({
  id: true,
  createdAt: true,
});

export const insertSideEffectLogSchema = createInsertSchema(sideEffectLogs).omit({
  id: true,
  createdAt: true,
});

export const insertProgressPhotoSchema = createInsertSchema(progressPhotos).omit({
  id: true,
  createdAt: true,
}).extend({
  photoUrl: z.string().optional(),
  weight: z.number().optional(),
  notes: z.string().optional(),
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
