import { 
  users, protocols, protocolItems, tasks, healthMetrics, integrations, voiceNotes,
  glp1Logs, sideEffectLogs, progressPhotos, pushSubscriptions,
  peptideCalculations, vialLogs, ouraDailyLogs,
  type User, type InsertUser, type Protocol, type InsertProtocol,
  type ProtocolItem, type InsertProtocolItem, type Task, type InsertTask,
  type HealthMetric, type InsertHealthMetric, type Integration, type InsertIntegration,
  type VoiceNote, type InsertVoiceNote,
  type Glp1Log, type InsertGlp1Log,
  type SideEffectLog, type InsertSideEffectLog,
  type ProgressPhoto, type InsertProgressPhoto,
  type PushSubscription, type InsertPushSubscription,
  type PeptideCalculation, type InsertPeptideCalculation,
  type VialLog,
  type OuraDailyLog, type InsertOuraDailyLog,
} from "@shared/schema";
import { db } from "./db";
import { randomBytes } from "crypto";

const DEMO_EMAIL = "alex@example.com";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getUserByAppleId(appleId: string): Promise<User | undefined>;
  getUsersWithRemindersEnabled(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User>;

  // Protocols
  getProtocols(userId: number): Promise<Protocol[]>;
  getProtocol(id: number, userId: number): Promise<Protocol | undefined>;
  createProtocol(protocol: InsertProtocol): Promise<Protocol>;
  updateProtocol(id: number, userId: number, protocol: Partial<Protocol>): Promise<Protocol | undefined>;
  deleteProtocol(id: number, userId: number): Promise<boolean>;

  // Protocol Items
  getProtocolItems(protocolId: number): Promise<ProtocolItem[]>;
  createProtocolItem(item: InsertProtocolItem): Promise<ProtocolItem>;
  getProtocolItemOwner(id: number): Promise<number | undefined>;
  updateProtocolItem(id: number, item: Partial<ProtocolItem>): Promise<ProtocolItem>;
  deleteProtocolItem(id: number): Promise<void>;
  deleteProtocolItems(protocolId: number): Promise<void>;

  // Tasks
  getTasks(userId: number, date?: string): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, userId: number, task: Partial<Task>): Promise<Task | undefined>;
  getTasksForDateRange(userId: number, startDate: string, endDate: string): Promise<Task[]>;

  // Health Metrics
  getHealthMetrics(userId: number, date?: string): Promise<HealthMetric[]>;
  createHealthMetric(metric: InsertHealthMetric): Promise<HealthMetric>;
  getHealthMetricsForDateRange(userId: number, startDate: string, endDate: string): Promise<HealthMetric[]>;

  // Integrations
  getIntegrations(userId: number): Promise<Integration[]>;
  getIntegrationByPlatform(userId: number, platform: string): Promise<Integration | undefined>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<Integration>): Promise<Integration>;
  updateUserIntegration(id: number, userId: number, integration: Partial<Integration>): Promise<Integration | undefined>;
  upsertIntegrationByPlatform(userId: number, platform: string, data: Partial<Integration>): Promise<Integration>;
  deleteIntegrationByPlatform(userId: number, platform: string): Promise<void>;

  // Voice Notes
  getVoiceNotes(userId: number): Promise<VoiceNote[]>;
  createVoiceNote(voiceNote: InsertVoiceNote): Promise<VoiceNote>;
  updateVoiceNote(id: number, voiceNote: Partial<VoiceNote>): Promise<VoiceNote>;
  getVoiceNote(id: number, userId: number): Promise<VoiceNote | undefined>;

  // GLP-1 Logs
  getGlp1Logs(userId: number): Promise<Glp1Log[]>;
  getGlp1Log(id: number, userId: number): Promise<Glp1Log | undefined>;
  createGlp1Log(log: InsertGlp1Log): Promise<Glp1Log>;
  deleteGlp1Log(id: number, userId: number): Promise<boolean>;
  getGlp1LogsForDateRange(userId: number, startDate: string, endDate: string): Promise<Glp1Log[]>;
  getTodayGlp1Log(userId: number, date: string): Promise<Glp1Log | undefined>;

  // Side Effect Logs
  getSideEffectLogs(userId: number): Promise<SideEffectLog[]>;
  getSideEffectLog(id: number, userId: number): Promise<SideEffectLog | undefined>;
  getTodaySideEffectLog(userId: number, date: string): Promise<SideEffectLog | undefined>;
  createSideEffectLog(log: InsertSideEffectLog): Promise<SideEffectLog>;
  updateSideEffectLog(id: number, userId: number, log: Partial<SideEffectLog>): Promise<SideEffectLog | undefined>;
  getSideEffectLogsForDateRange(userId: number, startDate: string, endDate: string): Promise<SideEffectLog[]>;

  // Progress Photos
  getProgressPhotos(userId: number): Promise<ProgressPhoto[]>;
  getProgressPhoto(id: number, userId: number): Promise<ProgressPhoto | undefined>;
  createProgressPhoto(photo: InsertProgressPhoto): Promise<ProgressPhoto>;
  deleteProgressPhoto(id: number, userId: number): Promise<boolean>;
  upsertWithingsWeightEntry(userId: number, date: string, weightLbs: number): Promise<void>;

  // Push Subscriptions
  getPushSubscriptions(userId: number): Promise<PushSubscription[]>;
  upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string, userId: number): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;

  // Peptide Calculations
  getPeptideCalculations(userId: number): Promise<PeptideCalculation[]>;
  getPeptideCalculation(id: number): Promise<PeptideCalculation | undefined>;
  createPeptideCalculation(calc: InsertPeptideCalculation): Promise<PeptideCalculation>;
  updatePeptideCalculation(id: number, calc: Partial<PeptideCalculation>): Promise<PeptideCalculation>;
  deletePeptideCalculation(id: number): Promise<void>;

  // Vial Logs
  getVialLogs(calculationId: number): Promise<VialLog[]>;
  createVialLog(calculationId: number, userId: number): Promise<VialLog>;
  deleteLastVialLog(calculationId: number): Promise<void>;

  // Oura Daily Logs
  getOuraDailyLogs(userId: number, startDate?: string, endDate?: string): Promise<OuraDailyLog[]>;
  upsertOuraDailyLog(data: InsertOuraDailyLog): Promise<OuraDailyLog>;
}

export class DatabaseStorage implements IStorage {
  // The demo/legacy user was inserted with an explicit id, which leaves the
  // users.id sequence behind; realign it so new sign-ups don't collide.
  async syncUserIdSequence(): Promise<void> {
    await db.execute(sql`SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))`);
  }

  // Returns the demo account (alex@example.com), creating it if needed. On a
  // fresh database it becomes user #1, matching the pre-auth single-user data.
  // An account linked to Google or Apple is never used as the demo account, so the demo
  // button can't open a real user's data.
  async ensureDemoUser(): Promise<User> {
    const existing = await this.getUserByEmail(DEMO_EMAIL);
    if (existing) {
      if (existing.googleId || existing.appleId) throw new Error("Demo account email is linked to a real sign-in");
      return existing;
    }
    const userOneTaken = !!(await this.getUser(1));
    const [user] = await db.insert(users).values({
      ...(userOneTaken ? {} : { id: 1 }),
      username: userOneTaken ? `demo-${randomBytes(3).toString("hex")}` : "alex",
      email: DEMO_EMAIL,
      name: "Alex",
      avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=100&h=100",
      streak: 7,
      totalCompliance: 92,
    }).returning();
    await this.syncUserIdSequence();
    return user;
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user || undefined;
  }

  async getUserByAppleId(appleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.appleId, appleId));
    return user || undefined;
  }

  async getUsersWithRemindersEnabled(): Promise<User[]> {
    return db.select().from(users).where(eq(users.reminderEnabled, true));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    if (!user) throw new Error("User not found");
    return user;
  }

  // Protocols
  async getProtocols(userId: number): Promise<Protocol[]> {
    return await db.select().from(protocols).where(eq(protocols.userId, userId));
  }

  async getProtocol(id: number, userId: number): Promise<Protocol | undefined> {
    const [protocol] = await db.select().from(protocols)
      .where(and(eq(protocols.id, id), eq(protocols.userId, userId)));
    return protocol || undefined;
  }

  async createProtocol(insertProtocol: InsertProtocol): Promise<Protocol> {
    const [protocol] = await db.insert(protocols).values(insertProtocol).returning();
    return protocol;
  }

  async updateProtocol(id: number, userId: number, updates: Partial<Protocol>): Promise<Protocol | undefined> {
    const [protocol] = await db.update(protocols).set(updates)
      .where(and(eq(protocols.id, id), eq(protocols.userId, userId))).returning();
    return protocol || undefined;
  }

  async deleteProtocol(id: number, userId: number): Promise<boolean> {
    const deleted = await db.delete(protocols)
      .where(and(eq(protocols.id, id), eq(protocols.userId, userId))).returning();
    return deleted.length > 0;
  }

  // Protocol Items
  async getProtocolItems(protocolId: number): Promise<ProtocolItem[]> {
    return await db.select().from(protocolItems).where(eq(protocolItems.protocolId, protocolId));
  }

  async createProtocolItem(insertItem: InsertProtocolItem): Promise<ProtocolItem> {
    const [item] = await db.insert(protocolItems).values(insertItem).returning();
    return item;
  }

  async getProtocolItemOwner(id: number): Promise<number | undefined> {
    const [row] = await db.select({ userId: protocols.userId })
      .from(protocolItems)
      .innerJoin(protocols, eq(protocolItems.protocolId, protocols.id))
      .where(eq(protocolItems.id, id));
    return row?.userId;
  }

  async updateProtocolItem(id: number, updates: Partial<ProtocolItem>): Promise<ProtocolItem> {
    const [item] = await db.update(protocolItems).set(updates).where(eq(protocolItems.id, id)).returning();
    if (!item) throw new Error("Protocol item not found");
    return item;
  }

  async deleteProtocolItem(id: number): Promise<void> {
    await db.delete(protocolItems).where(eq(protocolItems.id, id));
  }

  async deleteProtocolItems(protocolId: number): Promise<void> {
    try {
      const itemsToDelete = await db.select().from(protocolItems).where(eq(protocolItems.protocolId, protocolId));
      for (const item of itemsToDelete) {
        await db.delete(tasks).where(eq(tasks.protocolItemId, item.id));
      }
      await db.delete(protocolItems).where(eq(protocolItems.protocolId, protocolId));
    } catch (error) {
      console.error("Error deleting protocol items:", error);
      throw error;
    }
  }

  // Tasks
  async getTasks(userId: number, date?: string): Promise<Task[]> {
    if (date) {
      return await db.select().from(tasks).where(
        and(eq(tasks.userId, userId), eq(tasks.date, date))
      );
    }
    return await db.select().from(tasks).where(eq(tasks.userId, userId));
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(insertTask).returning();
    return task;
  }

  async updateTask(id: number, userId: number, updates: Partial<Task>): Promise<Task | undefined> {
    if (updates.completed === true) {
      updates.completedAt = new Date();
    }
    const [task] = await db.update(tasks).set(updates)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId))).returning();
    return task || undefined;
  }

  async getTasksForDateRange(userId: number, startDate: string, endDate: string): Promise<Task[]> {
    return await db.select().from(tasks).where(
      and(eq(tasks.userId, userId), gte(tasks.date, startDate), lte(tasks.date, endDate))
    );
  }

  // Health Metrics
  async getHealthMetrics(userId: number, date?: string): Promise<HealthMetric[]> {
    if (date) {
      return await db.select().from(healthMetrics).where(
        and(eq(healthMetrics.userId, userId), eq(healthMetrics.date, date))
      );
    }
    return await db.select().from(healthMetrics).where(eq(healthMetrics.userId, userId));
  }

  async createHealthMetric(insertMetric: InsertHealthMetric): Promise<HealthMetric> {
    const [metric] = await db.insert(healthMetrics).values(insertMetric).returning();
    return metric;
  }

  async getHealthMetricsForDateRange(userId: number, startDate: string, endDate: string): Promise<HealthMetric[]> {
    return await db.select().from(healthMetrics).where(
      and(eq(healthMetrics.userId, userId), gte(healthMetrics.date, startDate), lte(healthMetrics.date, endDate))
    );
  }

  // Integrations
  async getIntegrations(userId: number): Promise<Integration[]> {
    return await db.select().from(integrations).where(eq(integrations.userId, userId));
  }

  async getIntegrationByPlatform(userId: number, platform: string): Promise<Integration | undefined> {
    const [integration] = await db.select().from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.platform, platform)));
    return integration || undefined;
  }

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const [integration] = await db.insert(integrations).values(insertIntegration).returning();
    return integration;
  }

  async updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration> {
    const [integration] = await db.update(integrations).set(updates).where(eq(integrations.id, id)).returning();
    if (!integration) throw new Error("Integration not found");
    return integration;
  }

  async updateUserIntegration(id: number, userId: number, updates: Partial<Integration>): Promise<Integration | undefined> {
    const [integration] = await db.update(integrations).set(updates)
      .where(and(eq(integrations.id, id), eq(integrations.userId, userId))).returning();
    return integration || undefined;
  }

  async upsertIntegrationByPlatform(userId: number, platform: string, data: Partial<Integration>): Promise<Integration> {
    const existing = await this.getIntegrationByPlatform(userId, platform);
    if (existing) {
      const [updated] = await db.update(integrations).set(data).where(eq(integrations.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(integrations).values({ userId, platform, ...data } as InsertIntegration).returning();
    return created;
  }

  async deleteIntegrationByPlatform(userId: number, platform: string): Promise<void> {
    await db.delete(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.platform, platform)));
  }

  // Voice Notes
  async getVoiceNotes(userId: number): Promise<VoiceNote[]> {
    return await db.select().from(voiceNotes).where(eq(voiceNotes.userId, userId));
  }

  async createVoiceNote(insertVoiceNote: InsertVoiceNote): Promise<VoiceNote> {
    const [voiceNote] = await db.insert(voiceNotes).values(insertVoiceNote).returning();
    return voiceNote;
  }

  async updateVoiceNote(id: number, updates: Partial<VoiceNote>): Promise<VoiceNote> {
    const [voiceNote] = await db.update(voiceNotes).set(updates).where(eq(voiceNotes.id, id)).returning();
    if (!voiceNote) throw new Error("Voice note not found");
    return voiceNote;
  }

  async getVoiceNote(id: number, userId: number): Promise<VoiceNote | undefined> {
    const [voiceNote] = await db.select().from(voiceNotes)
      .where(and(eq(voiceNotes.id, id), eq(voiceNotes.userId, userId)));
    return voiceNote || undefined;
  }

  // GLP-1 Logs
  async getGlp1Logs(userId: number): Promise<Glp1Log[]> {
    return await db.select().from(glp1Logs)
      .where(eq(glp1Logs.userId, userId))
      .orderBy(desc(glp1Logs.date), desc(glp1Logs.time));
  }

  async getGlp1Log(id: number, userId: number): Promise<Glp1Log | undefined> {
    const [log] = await db.select().from(glp1Logs)
      .where(and(eq(glp1Logs.id, id), eq(glp1Logs.userId, userId)));
    return log || undefined;
  }

  async createGlp1Log(insertLog: InsertGlp1Log): Promise<Glp1Log> {
    const [log] = await db.insert(glp1Logs).values(insertLog).returning();
    return log;
  }

  async deleteGlp1Log(id: number, userId: number): Promise<boolean> {
    const deleted = await db.delete(glp1Logs)
      .where(and(eq(glp1Logs.id, id), eq(glp1Logs.userId, userId))).returning();
    return deleted.length > 0;
  }

  async getGlp1LogsForDateRange(userId: number, startDate: string, endDate: string): Promise<Glp1Log[]> {
    return await db.select().from(glp1Logs).where(
      and(eq(glp1Logs.userId, userId), gte(glp1Logs.date, startDate), lte(glp1Logs.date, endDate))
    ).orderBy(glp1Logs.date);
  }

  async getTodayGlp1Log(userId: number, date: string): Promise<Glp1Log | undefined> {
    const [log] = await db.select().from(glp1Logs).where(
      and(eq(glp1Logs.userId, userId), eq(glp1Logs.date, date))
    );
    return log || undefined;
  }

  // Side Effect Logs
  async getSideEffectLogs(userId: number): Promise<SideEffectLog[]> {
    return await db.select().from(sideEffectLogs)
      .where(eq(sideEffectLogs.userId, userId))
      .orderBy(desc(sideEffectLogs.date));
  }

  async getSideEffectLog(id: number, userId: number): Promise<SideEffectLog | undefined> {
    const [log] = await db.select().from(sideEffectLogs)
      .where(and(eq(sideEffectLogs.id, id), eq(sideEffectLogs.userId, userId)));
    return log || undefined;
  }

  async getTodaySideEffectLog(userId: number, date: string): Promise<SideEffectLog | undefined> {
    const [log] = await db.select().from(sideEffectLogs).where(
      and(eq(sideEffectLogs.userId, userId), eq(sideEffectLogs.date, date))
    );
    return log || undefined;
  }

  async createSideEffectLog(insertLog: InsertSideEffectLog): Promise<SideEffectLog> {
    const [log] = await db.insert(sideEffectLogs).values(insertLog).returning();
    return log;
  }

  async updateSideEffectLog(id: number, userId: number, updates: Partial<SideEffectLog>): Promise<SideEffectLog | undefined> {
    const [log] = await db.update(sideEffectLogs).set(updates)
      .where(and(eq(sideEffectLogs.id, id), eq(sideEffectLogs.userId, userId))).returning();
    return log || undefined;
  }

  async getSideEffectLogsForDateRange(userId: number, startDate: string, endDate: string): Promise<SideEffectLog[]> {
    return await db.select().from(sideEffectLogs).where(
      and(eq(sideEffectLogs.userId, userId), gte(sideEffectLogs.date, startDate), lte(sideEffectLogs.date, endDate))
    ).orderBy(sideEffectLogs.date);
  }

  // Progress Photos
  async getProgressPhotos(userId: number): Promise<ProgressPhoto[]> {
    return await db.select().from(progressPhotos)
      .where(eq(progressPhotos.userId, userId))
      .orderBy(desc(progressPhotos.date));
  }

  async getProgressPhoto(id: number, userId: number): Promise<ProgressPhoto | undefined> {
    const [photo] = await db.select().from(progressPhotos)
      .where(and(eq(progressPhotos.id, id), eq(progressPhotos.userId, userId)));
    return photo || undefined;
  }

  async createProgressPhoto(insertPhoto: InsertProgressPhoto): Promise<ProgressPhoto> {
    const [photo] = await db.insert(progressPhotos).values(insertPhoto).returning();
    return photo;
  }

  async deleteProgressPhoto(id: number, userId: number): Promise<boolean> {
    const deleted = await db.delete(progressPhotos)
      .where(and(eq(progressPhotos.id, id), eq(progressPhotos.userId, userId))).returning();
    return deleted.length > 0;
  }

  async upsertWithingsWeightEntry(userId: number, date: string, weightLbs: number): Promise<void> {
    const [existing] = await db.select().from(progressPhotos).where(
      and(eq(progressPhotos.userId, userId), eq(progressPhotos.date, date), eq(progressPhotos.notes, "Synced from Withings"))
    ).limit(1);
    if (existing) {
      await db.update(progressPhotos)
        .set({ weight: weightLbs })
        .where(eq(progressPhotos.id, existing.id));
    } else {
      await db.insert(progressPhotos).values({ userId, date, weight: weightLbs, photoUrl: null, notes: "Synced from Withings" });
    }
  }

  // Push Subscriptions
  async getPushSubscriptions(userId: number): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  async upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription> {
    const existing = await db.select().from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, sub.endpoint));
    if (existing.length > 0) {
      const [updated] = await db.update(pushSubscriptions)
        .set({ userId: sub.userId, p256dh: sub.p256dh, auth: sub.auth })
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .returning();
      return updated;
    }
    const [created] = await db.insert(pushSubscriptions).values(sub).returning();
    return created;
  }

  async deletePushSubscription(endpoint: string, userId: number): Promise<void> {
    await db.delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, userId)));
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions);
  }

  // Peptide Calculations
  async getPeptideCalculations(userId: number): Promise<PeptideCalculation[]> {
    return db.select().from(peptideCalculations)
      .where(eq(peptideCalculations.userId, userId))
      .orderBy(desc(peptideCalculations.createdAt));
  }

  async getPeptideCalculation(id: number): Promise<PeptideCalculation | undefined> {
    const [calc] = await db.select().from(peptideCalculations).where(eq(peptideCalculations.id, id));
    return calc || undefined;
  }

  async createPeptideCalculation(calc: InsertPeptideCalculation): Promise<PeptideCalculation> {
    const [created] = await db.insert(peptideCalculations).values(calc).returning();
    return created;
  }

  async updatePeptideCalculation(id: number, updates: Partial<PeptideCalculation>): Promise<PeptideCalculation> {
    const [updated] = await db.update(peptideCalculations).set(updates).where(eq(peptideCalculations.id, id)).returning();
    if (!updated) throw new Error("Peptide calculation not found");
    return updated;
  }

  async deletePeptideCalculation(id: number): Promise<void> {
    await db.delete(vialLogs).where(eq(vialLogs.calculationId, id));
    await db.delete(peptideCalculations).where(eq(peptideCalculations.id, id));
  }

  // Vial Logs
  async getVialLogs(calculationId: number): Promise<VialLog[]> {
    return db.select().from(vialLogs)
      .where(eq(vialLogs.calculationId, calculationId))
      .orderBy(desc(vialLogs.loggedAt));
  }

  async createVialLog(calculationId: number, userId: number): Promise<VialLog> {
    const [log] = await db.insert(vialLogs).values({ calculationId, userId }).returning();
    return log;
  }

  async deleteLastVialLog(calculationId: number): Promise<void> {
    const logs = await db.select().from(vialLogs)
      .where(eq(vialLogs.calculationId, calculationId))
      .orderBy(desc(vialLogs.loggedAt))
      .limit(1);
    if (logs.length > 0) {
      await db.delete(vialLogs).where(eq(vialLogs.id, logs[0].id));
    }
  }

  // Oura Daily Logs
  async getOuraDailyLogs(userId: number, startDate?: string, endDate?: string): Promise<OuraDailyLog[]> {
    if (startDate && endDate) {
      return db.select().from(ouraDailyLogs).where(
        and(eq(ouraDailyLogs.userId, userId), gte(ouraDailyLogs.date, startDate), lte(ouraDailyLogs.date, endDate))
      ).orderBy(ouraDailyLogs.date);
    }
    return db.select().from(ouraDailyLogs)
      .where(eq(ouraDailyLogs.userId, userId))
      .orderBy(ouraDailyLogs.date);
  }

  async upsertOuraDailyLog(data: InsertOuraDailyLog): Promise<OuraDailyLog> {
    const [existing] = await db.select().from(ouraDailyLogs)
      .where(and(eq(ouraDailyLogs.userId, data.userId), eq(ouraDailyLogs.date, data.date)));
    if (existing) {
      const [updated] = await db.update(ouraDailyLogs).set(data).where(eq(ouraDailyLogs.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(ouraDailyLogs).values(data).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
