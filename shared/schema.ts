import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  weight: integer("weight"), // in grams
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

// Insert schemas
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

// Types
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
