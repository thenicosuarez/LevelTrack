import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { processVoiceNoteAsync } from "./ai-processor";
import { 
  insertProtocolSchema, insertProtocolItemSchema, insertTaskSchema,
  insertHealthMetricSchema, insertIntegrationSchema, insertVoiceNoteSchema
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  const currentUserId = 1; // For demo purposes

  // User routes
  app.get("/api/user", async (req, res) => {
    try {
      const user = await storage.getUser(currentUserId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.patch("/api/user", async (req, res) => {
    try {
      const user = await storage.updateUser(currentUserId, req.body);
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Protocol routes
  app.get("/api/protocols", async (req, res) => {
    try {
      const protocols = await storage.getProtocols(currentUserId);
      res.json(protocols);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch protocols" });
    }
  });

  app.get("/api/protocols/:id", async (req, res) => {
    try {
      const protocol = await storage.getProtocol(parseInt(req.params.id));
      if (!protocol) {
        return res.status(404).json({ error: "Protocol not found" });
      }
      res.json(protocol);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch protocol" });
    }
  });

  app.post("/api/protocols", async (req, res) => {
    try {
      const validatedData = insertProtocolSchema.parse({
        ...req.body,
        userId: currentUserId,
      });
      const protocol = await storage.createProtocol(validatedData);
      res.json(protocol);
    } catch (error) {
      res.status(400).json({ error: "Invalid protocol data" });
    }
  });

  app.patch("/api/protocols/:id", async (req, res) => {
    try {
      const protocol = await storage.updateProtocol(parseInt(req.params.id), req.body);
      res.json(protocol);
    } catch (error) {
      res.status(500).json({ error: "Failed to update protocol" });
    }
  });

  app.delete("/api/protocols/:id", async (req, res) => {
    try {
      await storage.deleteProtocol(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete protocol" });
    }
  });

  // Protocol items routes
  app.get("/api/protocols/:id/items", async (req, res) => {
    try {
      const items = await storage.getProtocolItems(parseInt(req.params.id));
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch protocol items" });
    }
  });

  app.post("/api/protocols/:id/items", async (req, res) => {
    try {
      const validatedData = insertProtocolItemSchema.parse({
        ...req.body,
        protocolId: parseInt(req.params.id),
      });
      const item = await storage.createProtocolItem(validatedData);
      res.json(item);
    } catch (error) {
      res.status(400).json({ error: "Invalid protocol item data" });
    }
  });

  app.patch("/api/protocol-items/:id", async (req, res) => {
    try {
      const item = await storage.updateProtocolItem(parseInt(req.params.id), req.body);
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update protocol item" });
    }
  });

  app.delete("/api/protocol-items/:id", async (req, res) => {
    try {
      await storage.deleteProtocolItem(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete protocol item" });
    }
  });

  app.delete("/api/protocols/:id/items", async (req, res) => {
    try {
      const protocolId = parseInt(req.params.id);
      await storage.deleteProtocolItems(protocolId);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete protocol items error:", error);
      res.status(500).json({ error: "Failed to delete protocol items" });
    }
  });

  // Protocol compliance route
  app.get("/api/protocols/compliance", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const protocols = await storage.getProtocols(currentUserId);
      const tasks = await storage.getTasksForDateRange(currentUserId, startDate, endDate);
      
      const complianceData: Record<number, { total: number; completed: number }> = {};
      
      // Initialize compliance data for each protocol
      protocols.forEach(protocol => {
        complianceData[protocol.id] = { total: 0, completed: 0 };
      });
      
      // Calculate compliance for each protocol
      tasks.forEach(task => {
        if (complianceData[task.protocolId]) {
          complianceData[task.protocolId].total++;
          if (task.completed) {
            complianceData[task.protocolId].completed++;
          }
        }
      });
      
      // Convert to percentage
      const compliancePercentages: Record<number, number> = {};
      Object.entries(complianceData).forEach(([protocolId, data]) => {
        const percentage = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
        compliancePercentages[parseInt(protocolId)] = percentage;
      });
      
      res.json(compliancePercentages);
    } catch (error) {
      console.error("Protocol compliance error:", error);
      res.status(500).json({ error: "Failed to fetch protocol compliance" });
    }
  });

  // Task routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const date = req.query.date as string;
      const tasks = await storage.getTasks(currentUserId, date);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/tasks/generate", async (req, res) => {
    try {
      const { date } = req.body;
      const targetDate = date || new Date().toISOString().split('T')[0];
      
      // Get active protocols for the user
      const protocols = await storage.getProtocols(currentUserId);
      const activeProtocols = protocols.filter(p => {
        // Only include protocols that have started
        if (p.startDate && p.startDate > targetDate) {
          return false;
        }
        return p.isActive;
      });
      
      // Generate tasks for each protocol
      const generatedTasks = [];
      for (const protocol of activeProtocols) {
        const items = await storage.getProtocolItems(protocol.id);
        
        for (const item of items) {
          // Check if task already exists for this date
          const existingTasks = await storage.getTasks(currentUserId, targetDate);
          const taskExists = existingTasks.some(t => 
            t.protocolId === protocol.id && 
            t.protocolItemId === item.id && 
            t.date === targetDate
          );
          
          if (!taskExists) {
            const task = await storage.createTask({
              userId: currentUserId,
              protocolId: protocol.id,
              protocolItemId: item.id,
              date: targetDate,
              completed: false,
              notes: null,
            });
            generatedTasks.push(task);
          }
        }
      }
      
      res.json({ 
        message: `Generated ${generatedTasks.length} tasks for ${targetDate}`,
        tasks: generatedTasks
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse({
        ...req.body,
        userId: currentUserId,
      });
      const task = await storage.createTask(validatedData);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const taskId = parseInt(req.params.id);
      const updates = req.body;
      
      // Handle timestamp properly - don't set it here, let the database handle it
      if (updates.completed === true && !updates.completedAt) {
        // Remove completedAt from updates to avoid timestamp conversion issues
        delete updates.completedAt;
      } else if (updates.completed === false) {
        updates.completedAt = null;
      }
      
      const task = await storage.updateTask(taskId, updates);
      res.json(task);
    } catch (error) {
      console.error("Task update error:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.get("/api/tasks/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start date and end date are required" });
      }
      const tasks = await storage.getTasksForDateRange(currentUserId, startDate as string, endDate as string);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks for date range" });
    }
  });

  // Health metrics routes
  app.get("/api/health-metrics", async (req, res) => {
    try {
      const date = req.query.date as string;
      const metrics = await storage.getHealthMetrics(currentUserId, date);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch health metrics" });
    }
  });

  app.post("/api/health-metrics", async (req, res) => {
    try {
      const validatedData = insertHealthMetricSchema.parse({
        ...req.body,
        userId: currentUserId,
      });
      const metric = await storage.createHealthMetric(validatedData);
      res.json(metric);
    } catch (error) {
      res.status(400).json({ error: "Invalid health metric data" });
    }
  });

  app.get("/api/health-metrics/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "Start date and end date are required" });
      }
      const metrics = await storage.getHealthMetricsForDateRange(currentUserId, startDate as string, endDate as string);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch health metrics for date range" });
    }
  });

  // Integration routes
  app.get("/api/integrations", async (req, res) => {
    try {
      const integrations = await storage.getIntegrations(currentUserId);
      res.json(integrations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch integrations" });
    }
  });

  app.post("/api/integrations", async (req, res) => {
    try {
      const validatedData = insertIntegrationSchema.parse({
        ...req.body,
        userId: currentUserId,
      });
      const integration = await storage.createIntegration(validatedData);
      res.json(integration);
    } catch (error) {
      res.status(400).json({ error: "Invalid integration data" });
    }
  });

  app.patch("/api/integrations/:id", async (req, res) => {
    try {
      const integration = await storage.updateIntegration(parseInt(req.params.id), req.body);
      res.json(integration);
    } catch (error) {
      res.status(500).json({ error: "Failed to update integration" });
    }
  });

  // Dashboard analytics
  app.get("/api/analytics/dashboard", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const [todayTasks, weekTasks, healthMetrics] = await Promise.all([
        storage.getTasks(currentUserId, today),
        storage.getTasksForDateRange(currentUserId, weekAgo, today),
        storage.getHealthMetrics(currentUserId, today)
      ]);

      const todayCompleted = todayTasks.filter(t => t.completed).length;
      const todayTotal = todayTasks.length;
      const todayCompliance = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

      const weekCompleted = weekTasks.filter(t => t.completed).length;
      const weekTotal = weekTasks.length;
      const weekCompliance = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

      const latestMetrics = healthMetrics.length > 0 ? healthMetrics[0] : null;

      res.json({
        todayCompliance,
        weekCompliance,
        todayTasks: todayTasks.length,
        completedTasks: todayCompleted,
        sleepHours: latestMetrics?.sleepHours || 0,
        mood: latestMetrics?.mood || 'fair',
        energy: latestMetrics?.energy || 5,
        weeklyData: Array.from({ length: 7 }, (_, i) => {
          const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const dayTasks = weekTasks.filter(t => t.date === date);
          const dayCompleted = dayTasks.filter(t => t.completed).length;
          const dayTotal = dayTasks.length;
          return {
            date,
            compliance: dayTotal > 0 ? Math.round((dayCompleted / dayTotal) * 100) : 0
          };
        }).reverse()
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard analytics" });
    }
  });

  // Voice Note routes
  app.get("/api/voice-notes", async (req, res) => {
    try {
      const voiceNotes = await storage.getVoiceNotes(currentUserId);
      res.json(voiceNotes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch voice notes" });
    }
  });

  app.get("/api/voice-notes/:id", async (req, res) => {
    try {
      const voiceNote = await storage.getVoiceNote(parseInt(req.params.id));
      if (!voiceNote) {
        return res.status(404).json({ error: "Voice note not found" });
      }
      res.json(voiceNote);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch voice note" });
    }
  });

  app.post("/api/voice-notes", async (req, res) => {
    try {
      const validatedData = insertVoiceNoteSchema.parse({
        ...req.body,
        userId: currentUserId,
      });
      
      const voiceNote = await storage.createVoiceNote(validatedData);
      
      // Process the voice note asynchronously
      processVoiceNoteAsync(voiceNote.id, req.body.audioData);
      
      res.json(voiceNote);
    } catch (error) {
      res.status(400).json({ error: "Invalid voice note data" });
    }
  });

  // Label scanning route
  app.post("/api/scan-label", async (req, res) => {
    try {
      // Mock response for now - will implement with OpenAI Vision API
      const mockResult = {
        supplementName: "Magnesium Glycinate",
        brand: "Thorne",
        dosageAmount: "200",
        dosageUnit: "mg",
        servingSize: "2 capsules",
        ingredients: ["Magnesium Glycinate", "Hypromellose", "Microcrystalline Cellulose"],
        confidence: 92,
        suggestions: [
          "Take with food for better absorption",
          "Consider timing before bedtime for sleep benefits",
          "Start with 1 capsule to assess tolerance"
        ]
      };
      
      // Simulate processing time
      setTimeout(() => {
        res.json(mockResult);
      }, 1000);
    } catch (error) {
      res.status(500).json({ error: "Failed to process label scan" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
