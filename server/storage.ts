import { 
  users, protocols, protocolItems, tasks, healthMetrics, integrations, voiceNotes,
  glp1Logs, sideEffectLogs, progressPhotos, pushSubscriptions,
  type User, type InsertUser, type Protocol, type InsertProtocol,
  type ProtocolItem, type InsertProtocolItem, type Task, type InsertTask,
  type HealthMetric, type InsertHealthMetric, type Integration, type InsertIntegration,
  type VoiceNote, type InsertVoiceNote,
  type Glp1Log, type InsertGlp1Log,
  type SideEffectLog, type InsertSideEffectLog,
  type ProgressPhoto, type InsertProgressPhoto,
  type PushSubscription, type InsertPushSubscription,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, user: Partial<User>): Promise<User>;

  // Protocols
  getProtocols(userId: number): Promise<Protocol[]>;
  getProtocol(id: number): Promise<Protocol | undefined>;
  createProtocol(protocol: InsertProtocol): Promise<Protocol>;
  updateProtocol(id: number, protocol: Partial<Protocol>): Promise<Protocol>;
  deleteProtocol(id: number): Promise<void>;

  // Protocol Items
  getProtocolItems(protocolId: number): Promise<ProtocolItem[]>;
  createProtocolItem(item: InsertProtocolItem): Promise<ProtocolItem>;
  updateProtocolItem(id: number, item: Partial<ProtocolItem>): Promise<ProtocolItem>;
  deleteProtocolItem(id: number): Promise<void>;
  deleteProtocolItems(protocolId: number): Promise<void>;

  // Tasks
  getTasks(userId: number, date?: string): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<Task>): Promise<Task>;
  getTasksForDateRange(userId: number, startDate: string, endDate: string): Promise<Task[]>;

  // Health Metrics
  getHealthMetrics(userId: number, date?: string): Promise<HealthMetric[]>;
  createHealthMetric(metric: InsertHealthMetric): Promise<HealthMetric>;
  getHealthMetricsForDateRange(userId: number, startDate: string, endDate: string): Promise<HealthMetric[]>;

  // Integrations
  getIntegrations(userId: number): Promise<Integration[]>;
  createIntegration(integration: InsertIntegration): Promise<Integration>;
  updateIntegration(id: number, integration: Partial<Integration>): Promise<Integration>;

  // Voice Notes
  getVoiceNotes(userId: number): Promise<VoiceNote[]>;
  createVoiceNote(voiceNote: InsertVoiceNote): Promise<VoiceNote>;
  updateVoiceNote(id: number, voiceNote: Partial<VoiceNote>): Promise<VoiceNote>;
  getVoiceNote(id: number): Promise<VoiceNote | undefined>;

  // GLP-1 Logs
  getGlp1Logs(userId: number): Promise<Glp1Log[]>;
  getGlp1Log(id: number): Promise<Glp1Log | undefined>;
  createGlp1Log(log: InsertGlp1Log): Promise<Glp1Log>;
  deleteGlp1Log(id: number): Promise<void>;
  getGlp1LogsForDateRange(userId: number, startDate: string, endDate: string): Promise<Glp1Log[]>;
  getTodayGlp1Log(userId: number, date: string): Promise<Glp1Log | undefined>;

  // Side Effect Logs
  getSideEffectLogs(userId: number): Promise<SideEffectLog[]>;
  getSideEffectLog(id: number): Promise<SideEffectLog | undefined>;
  getTodaySideEffectLog(userId: number, date: string): Promise<SideEffectLog | undefined>;
  createSideEffectLog(log: InsertSideEffectLog): Promise<SideEffectLog>;
  updateSideEffectLog(id: number, log: Partial<SideEffectLog>): Promise<SideEffectLog>;
  getSideEffectLogsForDateRange(userId: number, startDate: string, endDate: string): Promise<SideEffectLog[]>;

  // Progress Photos
  getProgressPhotos(userId: number): Promise<ProgressPhoto[]>;
  getProgressPhoto(id: number): Promise<ProgressPhoto | undefined>;
  createProgressPhoto(photo: InsertProgressPhoto): Promise<ProgressPhoto>;
  deleteProgressPhoto(id: number): Promise<void>;

  // Push Subscriptions
  getPushSubscriptions(userId: number): Promise<PushSubscription[]>;
  upsertPushSubscription(sub: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<void>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    this.initializeDefaultUser();
  }

  private async initializeDefaultUser() {
    try {
      const existingUser = await this.getUser(1);
      if (!existingUser) {
        await db.insert(users).values({
          id: 1,
          username: "alex",
          email: "alex@example.com",
          name: "Alex",
          avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=100&h=100",
          streak: 7,
          totalCompliance: 92,
        });
      }
    } catch (error) {
      console.log("Default user initialization handled");
    }
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

  async getProtocol(id: number): Promise<Protocol | undefined> {
    const [protocol] = await db.select().from(protocols).where(eq(protocols.id, id));
    return protocol || undefined;
  }

  async createProtocol(insertProtocol: InsertProtocol): Promise<Protocol> {
    const [protocol] = await db.insert(protocols).values(insertProtocol).returning();
    return protocol;
  }

  async updateProtocol(id: number, updates: Partial<Protocol>): Promise<Protocol> {
    const [protocol] = await db.update(protocols).set(updates).where(eq(protocols.id, id)).returning();
    if (!protocol) throw new Error("Protocol not found");
    return protocol;
  }

  async deleteProtocol(id: number): Promise<void> {
    await db.delete(protocols).where(eq(protocols.id, id));
  }

  // Protocol Items
  async getProtocolItems(protocolId: number): Promise<ProtocolItem[]> {
    return await db.select().from(protocolItems).where(eq(protocolItems.protocolId, protocolId));
  }

  async createProtocolItem(insertItem: InsertProtocolItem): Promise<ProtocolItem> {
    const [item] = await db.insert(protocolItems).values(insertItem).returning();
    return item;
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

  async updateTask(id: number, updates: Partial<Task>): Promise<Task> {
    if (updates.completed === true) {
      updates.completedAt = new Date();
    }
    const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    if (!task) throw new Error("Task not found");
    return task;
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

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const [integration] = await db.insert(integrations).values(insertIntegration).returning();
    return integration;
  }

  async updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration> {
    const [integration] = await db.update(integrations).set(updates).where(eq(integrations.id, id)).returning();
    if (!integration) throw new Error("Integration not found");
    return integration;
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

  async getVoiceNote(id: number): Promise<VoiceNote | undefined> {
    const [voiceNote] = await db.select().from(voiceNotes).where(eq(voiceNotes.id, id));
    return voiceNote || undefined;
  }

  // GLP-1 Logs
  async getGlp1Logs(userId: number): Promise<Glp1Log[]> {
    return await db.select().from(glp1Logs)
      .where(eq(glp1Logs.userId, userId))
      .orderBy(desc(glp1Logs.date), desc(glp1Logs.time));
  }

  async getGlp1Log(id: number): Promise<Glp1Log | undefined> {
    const [log] = await db.select().from(glp1Logs).where(eq(glp1Logs.id, id));
    return log || undefined;
  }

  async createGlp1Log(insertLog: InsertGlp1Log): Promise<Glp1Log> {
    const [log] = await db.insert(glp1Logs).values(insertLog).returning();
    return log;
  }

  async deleteGlp1Log(id: number): Promise<void> {
    await db.delete(glp1Logs).where(eq(glp1Logs.id, id));
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

  async getSideEffectLog(id: number): Promise<SideEffectLog | undefined> {
    const [log] = await db.select().from(sideEffectLogs).where(eq(sideEffectLogs.id, id));
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

  async updateSideEffectLog(id: number, updates: Partial<SideEffectLog>): Promise<SideEffectLog> {
    const [log] = await db.update(sideEffectLogs).set(updates).where(eq(sideEffectLogs.id, id)).returning();
    if (!log) throw new Error("Side effect log not found");
    return log;
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

  async getProgressPhoto(id: number): Promise<ProgressPhoto | undefined> {
    const [photo] = await db.select().from(progressPhotos).where(eq(progressPhotos.id, id));
    return photo || undefined;
  }

  async createProgressPhoto(insertPhoto: InsertProgressPhoto): Promise<ProgressPhoto> {
    const [photo] = await db.insert(progressPhotos).values(insertPhoto).returning();
    return photo;
  }

  async deleteProgressPhoto(id: number): Promise<void> {
    await db.delete(progressPhotos).where(eq(progressPhotos.id, id));
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
        .set({ p256dh: sub.p256dh, auth: sub.auth })
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .returning();
      return updated;
    }
    const [created] = await db.insert(pushSubscriptions).values(sub).returning();
    return created;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions);
  }
}

export const storage = new DatabaseStorage();
