import { 
  users, protocols, protocolItems, tasks, healthMetrics, integrations,
  type User, type InsertUser, type Protocol, type InsertProtocol,
  type ProtocolItem, type InsertProtocolItem, type Task, type InsertTask,
  type HealthMetric, type InsertHealthMetric, type Integration, type InsertIntegration
} from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private protocols: Map<number, Protocol> = new Map();
  private protocolItems: Map<number, ProtocolItem> = new Map();
  private tasks: Map<number, Task> = new Map();
  private healthMetrics: Map<number, HealthMetric> = new Map();
  private integrations: Map<number, Integration> = new Map();
  
  private currentUserId = 1;
  private currentProtocolId = 1;
  private currentProtocolItemId = 1;
  private currentTaskId = 1;
  private currentHealthMetricId = 1;
  private currentIntegrationId = 1;

  constructor() {
    // Initialize with default user
    this.users.set(1, {
      id: 1,
      username: "alex",
      email: "alex@example.com",
      name: "Alex",
      avatar: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=100&h=100",
      streak: 7,
      totalCompliance: 92,
      createdAt: new Date(),
    });
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      ...insertUser,
      id: this.currentUserId++,
      avatar: insertUser.avatar || null,
      streak: 0,
      totalCompliance: 0,
      createdAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error("User not found");
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Protocols
  async getProtocols(userId: number): Promise<Protocol[]> {
    return Array.from(this.protocols.values()).filter(p => p.userId === userId);
  }

  async getProtocol(id: number): Promise<Protocol | undefined> {
    return this.protocols.get(id);
  }

  async createProtocol(insertProtocol: InsertProtocol): Promise<Protocol> {
    const protocol: Protocol = {
      ...insertProtocol,
      id: this.currentProtocolId++,
      color: insertProtocol.color || "#14B8A6",
      description: insertProtocol.description || null,
      isActive: insertProtocol.isActive ?? true,
      goals: insertProtocol.goals || [],
      createdAt: new Date(),
    };
    this.protocols.set(protocol.id, protocol);
    return protocol;
  }

  async updateProtocol(id: number, updates: Partial<Protocol>): Promise<Protocol> {
    const protocol = this.protocols.get(id);
    if (!protocol) throw new Error("Protocol not found");
    
    const updatedProtocol = { ...protocol, ...updates };
    this.protocols.set(id, updatedProtocol);
    return updatedProtocol;
  }

  async deleteProtocol(id: number): Promise<void> {
    this.protocols.delete(id);
    // Also delete related items and tasks
    Array.from(this.protocolItems.keys()).forEach(key => {
      const item = this.protocolItems.get(key);
      if (item?.protocolId === id) {
        this.protocolItems.delete(key);
      }
    });
    Array.from(this.tasks.keys()).forEach(key => {
      const task = this.tasks.get(key);
      if (task?.protocolId === id) {
        this.tasks.delete(key);
      }
    });
  }

  // Protocol Items
  async getProtocolItems(protocolId: number): Promise<ProtocolItem[]> {
    return Array.from(this.protocolItems.values())
      .filter(item => item.protocolId === protocolId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  async createProtocolItem(insertItem: InsertProtocolItem): Promise<ProtocolItem> {
    const item: ProtocolItem = {
      ...insertItem,
      id: this.currentProtocolItemId++,
      dosageAmount: insertItem.dosageAmount || null,
      dosageUnit: insertItem.dosageUnit || null,
      frequency: insertItem.frequency || "daily",
      instructions: insertItem.instructions || null,
      order: insertItem.order || 0,
    };
    this.protocolItems.set(item.id, item);
    return item;
  }

  async updateProtocolItem(id: number, updates: Partial<ProtocolItem>): Promise<ProtocolItem> {
    const item = this.protocolItems.get(id);
    if (!item) throw new Error("Protocol item not found");
    
    const updatedItem = { ...item, ...updates };
    this.protocolItems.set(id, updatedItem);
    return updatedItem;
  }

  async deleteProtocolItem(id: number): Promise<void> {
    this.protocolItems.delete(id);
    // Also delete related tasks
    Array.from(this.tasks.keys()).forEach(key => {
      const task = this.tasks.get(key);
      if (task?.protocolItemId === id) {
        this.tasks.delete(key);
      }
    });
  }

  // Tasks
  async getTasks(userId: number, date?: string): Promise<Task[]> {
    const tasks = Array.from(this.tasks.values()).filter(task => task.userId === userId);
    return date ? tasks.filter(task => task.date === date) : tasks;
  }

  async getTask(id: number): Promise<Task | undefined> {
    return this.tasks.get(id);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const task: Task = {
      ...insertTask,
      id: this.currentTaskId++,
      completed: insertTask.completed || false,
      notes: insertTask.notes || null,
      completedAt: null,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  async updateTask(id: number, updates: Partial<Task>): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) throw new Error("Task not found");
    
    const updatedTask = { 
      ...task, 
      ...updates,
      completedAt: updates.completed ? new Date() : null
    };
    this.tasks.set(id, updatedTask);
    return updatedTask;
  }

  async getTasksForDateRange(userId: number, startDate: string, endDate: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(task => 
      task.userId === userId && 
      task.date >= startDate && 
      task.date <= endDate
    );
  }

  // Health Metrics
  async getHealthMetrics(userId: number, date?: string): Promise<HealthMetric[]> {
    const metrics = Array.from(this.healthMetrics.values()).filter(m => m.userId === userId);
    return date ? metrics.filter(m => m.date === date) : metrics;
  }

  async createHealthMetric(insertMetric: InsertHealthMetric): Promise<HealthMetric> {
    const metric: HealthMetric = {
      ...insertMetric,
      id: this.currentHealthMetricId++,
      sleepHours: insertMetric.sleepHours || null,
      mood: insertMetric.mood || null,
      energy: insertMetric.energy || null,
      stress: insertMetric.stress || null,
      weight: insertMetric.weight || null,
      heartRate: insertMetric.heartRate || null,
      steps: insertMetric.steps || null,
      source: insertMetric.source || null,
      rawData: insertMetric.rawData || null,
    };
    this.healthMetrics.set(metric.id, metric);
    return metric;
  }

  async getHealthMetricsForDateRange(userId: number, startDate: string, endDate: string): Promise<HealthMetric[]> {
    return Array.from(this.healthMetrics.values()).filter(metric => 
      metric.userId === userId && 
      metric.date >= startDate && 
      metric.date <= endDate
    );
  }

  // Integrations
  async getIntegrations(userId: number): Promise<Integration[]> {
    return Array.from(this.integrations.values()).filter(i => i.userId === userId);
  }

  async createIntegration(insertIntegration: InsertIntegration): Promise<Integration> {
    const integration: Integration = {
      ...insertIntegration,
      id: this.currentIntegrationId++,
      isActive: insertIntegration.isActive ?? true,
      accessToken: insertIntegration.accessToken || null,
      refreshToken: insertIntegration.refreshToken || null,
      settings: insertIntegration.settings || null,
      lastSync: null,
    };
    this.integrations.set(integration.id, integration);
    return integration;
  }

  async updateIntegration(id: number, updates: Partial<Integration>): Promise<Integration> {
    const integration = this.integrations.get(id);
    if (!integration) throw new Error("Integration not found");
    
    const updatedIntegration = { ...integration, ...updates };
    this.integrations.set(id, updatedIntegration);
    return updatedIntegration;
  }
}

export const storage = new MemStorage();
