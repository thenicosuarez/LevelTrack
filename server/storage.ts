import { 
  users, protocols, protocolItems, tasks, healthMetrics, integrations, voiceNotes,
  type User, type InsertUser, type Protocol, type InsertProtocol,
  type ProtocolItem, type InsertProtocolItem, type Task, type InsertTask,
  type HealthMetric, type InsertHealthMetric, type Integration, type InsertIntegration,
  type VoiceNote, type InsertVoiceNote
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Initialize default user if not exists
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
      // First, delete any tasks that reference protocol items from this protocol
      const itemsToDelete = await db.select().from(protocolItems).where(eq(protocolItems.protocolId, protocolId));
      
      for (const item of itemsToDelete) {
        await db.delete(tasks).where(eq(tasks.protocolItemId, item.id));
      }
      
      // Then delete the protocol items
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
        and(
          eq(tasks.userId, userId),
          eq(tasks.date, date)
        )
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
    // If marking as completed, set the timestamp
    if (updates.completed === true) {
      updates.completedAt = new Date();
    }
    
    const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    if (!task) throw new Error("Task not found");
    return task;
  }

  async getTasksForDateRange(userId: number, startDate: string, endDate: string): Promise<Task[]> {
    return await db.select().from(tasks).where(
      and(
        eq(tasks.userId, userId),
        gte(tasks.date, startDate),
        lte(tasks.date, endDate)
      )
    );
  }

  // Health Metrics
  async getHealthMetrics(userId: number, date?: string): Promise<HealthMetric[]> {
    if (date) {
      return await db.select().from(healthMetrics).where(
        and(
          eq(healthMetrics.userId, userId),
          eq(healthMetrics.date, date)
        )
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
      and(
        eq(healthMetrics.userId, userId),
        gte(healthMetrics.date, startDate),
        lte(healthMetrics.date, endDate)
      )
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
}

export const storage = new DatabaseStorage();
