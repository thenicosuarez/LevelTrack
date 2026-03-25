import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { processVoiceNoteAsync } from "./ai-processor";
import { z } from "zod";
import webpush from "web-push";
import { 
  insertProtocolSchema, insertProtocolItemSchema, insertTaskSchema,
  insertHealthMetricSchema, insertIntegrationSchema, insertVoiceNoteSchema,
  insertGlp1LogSchema, insertSideEffectLogSchema, insertProgressPhotoSchema,
} from "@shared/schema";

// ─── VAPID setup ─────────────────────────────────────────────────────────────
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:support@leveltrack.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const DAY_ABBREVS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function isInjectionDayToday(injectionDay: string | null): boolean {
  if (!injectionDay) return false;
  const todayNum = new Date().getDay();
  return DAY_ABBREVS[injectionDay] === todayNum;
}

const updateUserSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  glp1Drug: z.string().optional().nullable(),
  glp1Dose: z.number().positive().optional().nullable(),
  glp1DoseUnit: z.string().optional().nullable(),
  glp1InjectionFrequency: z.string().optional().nullable(),
  glp1InjectionDay: z.string().optional().nullable(),
  glp1StartDate: z.string().optional().nullable(),
  goalWeight: z.number().positive().optional().nullable(),
  weightUnit: z.enum(["lbs", "kg"]).optional(),
  hasCompletedOnboarding: z.boolean().optional(),
  reminderEnabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// Curated GLP-1 and peptide drug list
const GLP1_DRUGS = [
  // GLP-1 Receptor Agonists
  { name: "Ozempic", category: "GLP-1", generic: "Semaglutide", units: ["mg"], defaultUnit: "mg" },
  { name: "Wegovy", category: "GLP-1", generic: "Semaglutide", units: ["mg"], defaultUnit: "mg" },
  { name: "Mounjaro", category: "GLP-1/GIP", generic: "Tirzepatide", units: ["mg"], defaultUnit: "mg" },
  { name: "Zepbound", category: "GLP-1/GIP", generic: "Tirzepatide", units: ["mg"], defaultUnit: "mg" },
  { name: "Rybelsus", category: "GLP-1", generic: "Semaglutide (oral)", units: ["mg"], defaultUnit: "mg" },
  { name: "Victoza", category: "GLP-1", generic: "Liraglutide", units: ["mg"], defaultUnit: "mg" },
  { name: "Saxenda", category: "GLP-1", generic: "Liraglutide", units: ["mg"], defaultUnit: "mg" },
  { name: "Trulicity", category: "GLP-1", generic: "Dulaglutide", units: ["mg"], defaultUnit: "mg" },
  { name: "Byetta", category: "GLP-1", generic: "Exenatide", units: ["mcg"], defaultUnit: "mcg" },
  // Compounded / Generic
  { name: "Semaglutide (compounded)", category: "GLP-1", generic: "Semaglutide", units: ["mg", "mcg"], defaultUnit: "mg" },
  { name: "Tirzepatide (compounded)", category: "GLP-1/GIP", generic: "Tirzepatide", units: ["mg"], defaultUnit: "mg" },
  // Peptides
  { name: "BPC-157", category: "Peptide", generic: "BPC-157", units: ["mcg", "mg"], defaultUnit: "mcg" },
  { name: "TB-500", category: "Peptide", generic: "Thymosin Beta-4", units: ["mcg", "mg"], defaultUnit: "mg" },
  { name: "CJC-1295", category: "Peptide", generic: "CJC-1295", units: ["mcg"], defaultUnit: "mcg" },
  { name: "Ipamorelin", category: "Peptide", generic: "Ipamorelin", units: ["mcg"], defaultUnit: "mcg" },
  { name: "AOD-9604", category: "Peptide", generic: "AOD-9604", units: ["mcg"], defaultUnit: "mcg" },
  { name: "MK-677", category: "Peptide", generic: "Ibutamoren", units: ["mg"], defaultUnit: "mg" },
  { name: "PT-141", category: "Peptide", generic: "Bremelanotide", units: ["mg", "mcg"], defaultUnit: "mg" },
  { name: "Sermorelin", category: "Peptide", generic: "Sermorelin", units: ["mcg"], defaultUnit: "mcg" },
  { name: "Tesofensine", category: "Peptide", generic: "Tesofensine", units: ["mg"], defaultUnit: "mg" },
  // Custom
  { name: "Other (custom)", category: "Custom", generic: "", units: ["mg", "mcg", "IU", "units", "ml"], defaultUnit: "mg" },
];

export async function registerRoutes(app: Express): Promise<Server> {
  const currentUserId = 1; // For demo purposes

  // ─── User routes ─────────────────────────────────────────────────────────
  app.get("/api/user", async (req, res) => {
    try {
      const user = await storage.getUser(currentUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
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

  app.patch("/api/user/settings", async (req, res) => {
    try {
      const validatedData = updateUserSettingsSchema.parse(req.body);
      const user = await storage.updateUser(currentUserId, validatedData);
      res.json(user);
    } catch (error) {
      res.status(400).json({ error: "Invalid settings data" });
    }
  });

  // ─── Drug list ────────────────────────────────────────────────────────────
  app.get("/api/drugs", (req, res) => {
    res.json(GLP1_DRUGS);
  });

  // ─── Protocol routes ──────────────────────────────────────────────────────
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
      if (!protocol) return res.status(404).json({ error: "Protocol not found" });
      res.json(protocol);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch protocol" });
    }
  });

  app.post("/api/protocols", async (req, res) => {
    try {
      const validatedData = insertProtocolSchema.parse({ ...req.body, userId: currentUserId });
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

  // ─── Protocol items ───────────────────────────────────────────────────────
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
      const validatedData = insertProtocolItemSchema.parse({ ...req.body, protocolId: parseInt(req.params.id) });
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
      await storage.deleteProtocolItems(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete protocol items" });
    }
  });

  // ─── Protocol compliance ──────────────────────────────────────────────────
  app.get("/api/protocols/compliance", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const protocols = await storage.getProtocols(currentUserId);
      const endDate = new Date().toISOString().split('T')[0];
      const startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - days);
      const startDate = startDateObj.toISOString().split('T')[0];
      const allTasks = await storage.getTasks(currentUserId);
      const relevantTasks = allTasks.filter(t => t.date >= startDate && t.date <= endDate);
      const complianceData: Record<number, { total: number; completed: number }> = {};
      protocols.forEach(p => { complianceData[p.id] = { total: 0, completed: 0 }; });
      relevantTasks.forEach(t => {
        if (complianceData[t.protocolId]) {
          complianceData[t.protocolId].total++;
          if (t.completed) complianceData[t.protocolId].completed++;
        }
      });
      const compliancePercentages: Record<number, number> = {};
      Object.entries(complianceData).forEach(([id, data]) => {
        compliancePercentages[parseInt(id)] = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
      });
      res.json(compliancePercentages);
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate compliance" });
    }
  });

  // ─── Tasks ────────────────────────────────────────────────────────────────
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
      const protocols = await storage.getProtocols(currentUserId);
      const activeProtocols = protocols.filter(p => {
        if (p.startDate && p.startDate > targetDate) return false;
        return p.isActive;
      });
      const generatedTasks = [];
      for (const protocol of activeProtocols) {
        const items = await storage.getProtocolItems(protocol.id);
        for (const item of items) {
          const existingTasks = await storage.getTasks(currentUserId, targetDate);
          const taskExists = existingTasks.some(t =>
            t.protocolId === protocol.id && t.protocolItemId === item.id && t.date === targetDate
          );
          if (!taskExists) {
            const task = await storage.createTask({
              userId: currentUserId, protocolId: protocol.id,
              protocolItemId: item.id, date: targetDate, completed: false, notes: null,
            });
            generatedTasks.push(task);
          }
        }
      }
      res.json({ message: `Generated ${generatedTasks.length} tasks for ${targetDate}`, tasks: generatedTasks });
    } catch (error) {
      res.status(500).json({ error: "Failed to generate tasks" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const validatedData = insertTaskSchema.parse({ ...req.body, userId: currentUserId });
      const task = await storage.createTask(validatedData);
      res.json(task);
    } catch (error) {
      res.status(400).json({ error: "Invalid task data" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const updates = req.body;
      if (updates.completed === true && !updates.completedAt) delete updates.completedAt;
      else if (updates.completed === false) updates.completedAt = null;
      const task = await storage.updateTask(parseInt(req.params.id), updates);
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.get("/api/tasks/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ error: "Start date and end date are required" });
      const tasks = await storage.getTasksForDateRange(currentUserId, startDate as string, endDate as string);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks for date range" });
    }
  });

  // ─── Health Metrics ───────────────────────────────────────────────────────
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
      const validatedData = insertHealthMetricSchema.parse({ ...req.body, userId: currentUserId });
      const metric = await storage.createHealthMetric(validatedData);
      res.json(metric);
    } catch (error) {
      res.status(400).json({ error: "Invalid health metric data" });
    }
  });

  app.get("/api/health-metrics/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ error: "Start date and end date are required" });
      const metrics = await storage.getHealthMetricsForDateRange(currentUserId, startDate as string, endDate as string);
      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch health metrics for date range" });
    }
  });

  // ─── Integrations ─────────────────────────────────────────────────────────
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
      const validatedData = insertIntegrationSchema.parse({ ...req.body, userId: currentUserId });
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

  // ─── Dashboard analytics ──────────────────────────────────────────────────
  app.get("/api/analytics/dashboard", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [todayTasks, weekTasks, healthMetrics, todayGlp1, recentGlp1, allMetrics, allPhotos] = await Promise.all([
        storage.getTasks(currentUserId, today),
        storage.getTasksForDateRange(currentUserId, weekAgo, today),
        storage.getHealthMetrics(currentUserId, today),
        storage.getTodayGlp1Log(currentUserId, today),
        storage.getGlp1Logs(currentUserId),
        storage.getHealthMetrics(currentUserId), // all-time, for accurate weight history
        storage.getProgressPhotos(currentUserId),
      ]);

      const todayCompleted = todayTasks.filter(t => t.completed).length;
      const todayTotal = todayTasks.length;
      const todayCompliance = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;

      const weekCompleted = weekTasks.filter(t => t.completed).length;
      const weekTotal = weekTasks.length;
      const weekCompliance = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;

      const latestMetrics = healthMetrics.length > 0 ? healthMetrics[0] : null;

      // Calculate 30-day shot adherence
      const glp1DaysIn30 = recentGlp1.filter(m => m.date >= thirtyDaysAgo).length;
      const glp1Adherence = Math.min(Math.round((glp1DaysIn30 / 30) * 100), 100);

      // Latest weight — most recent dated entry across both sources
      const allWeightEntriesRaw = [
        ...allMetrics.filter(m => m.weight != null).map(m => ({ date: m.date, weight: m.weight! })),
        ...allPhotos.filter(p => p.weight != null).map(p => ({ date: p.date, weight: p.weight! })),
      ].sort((a, b) => a.date.localeCompare(b.date));
      const latestWeight = allWeightEntriesRaw.length > 0
        ? allWeightEntriesRaw[allWeightEntriesRaw.length - 1].weight
        : null;

      // Total weight lost (first vs latest entry across both sources)
      const firstEntry = allWeightEntriesRaw[0];
      const lastEntry = allWeightEntriesRaw[allWeightEntriesRaw.length - 1];
      const totalWeightLost = firstEntry && lastEntry && firstEntry.date !== lastEntry.date
        ? Math.round((firstEntry.weight - lastEntry.weight) * 10) / 10
        : null;

      // Latest shot info
      const latestShot = recentGlp1.length > 0 ? recentGlp1[0] : null;

      res.json({
        todayCompliance,
        weekCompliance,
        todayTasks: todayTasks.length,
        completedTasks: todayCompleted,
        sleepHours: latestMetrics?.sleepHours || 0,
        mood: latestMetrics?.mood || 'fair',
        energy: latestMetrics?.energy || 5,
        todayShotLogged: !!todayGlp1,
        todayShot: todayGlp1 || null,
        latestShot: latestShot || null,
        glp1Adherence,
        latestWeight,
        totalWeightLost,
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

  // ─── Voice Notes ──────────────────────────────────────────────────────────
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
      if (!voiceNote) return res.status(404).json({ error: "Voice note not found" });
      res.json(voiceNote);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch voice note" });
    }
  });

  app.post("/api/voice-notes", async (req, res) => {
    try {
      const validatedData = insertVoiceNoteSchema.parse({ ...req.body, userId: currentUserId });
      const voiceNote = await storage.createVoiceNote(validatedData);
      processVoiceNoteAsync(voiceNote.id, req.body.audioData);
      res.json(voiceNote);
    } catch (error) {
      res.status(400).json({ error: "Invalid voice note data" });
    }
  });

  // ─── Label scanning ───────────────────────────────────────────────────────
  app.post("/api/scan-label", async (req, res) => {
    try {
      setTimeout(() => {
        res.json({
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
        });
      }, 1000);
    } catch (error) {
      res.status(500).json({ error: "Failed to process label scan" });
    }
  });

  // ─── GLP-1 Logs ───────────────────────────────────────────────────────────
  app.get("/api/glp1-logs", async (req, res) => {
    try {
      const logs = await storage.getGlp1Logs(currentUserId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch GLP-1 logs" });
    }
  });

  app.get("/api/glp1-logs/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ error: "Start date and end date are required" });
      const logs = await storage.getGlp1LogsForDateRange(currentUserId, startDate as string, endDate as string);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch GLP-1 logs for date range" });
    }
  });

  app.get("/api/glp1-logs/:id", async (req, res) => {
    try {
      const log = await storage.getGlp1Log(parseInt(req.params.id));
      if (!log) return res.status(404).json({ error: "GLP-1 log not found" });
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch GLP-1 log" });
    }
  });

  app.post("/api/glp1-logs", async (req, res) => {
    try {
      const validatedData = insertGlp1LogSchema.parse({ ...req.body, userId: currentUserId });
      const log = await storage.createGlp1Log(validatedData);
      res.json(log);
    } catch (error) {
      console.error("GLP-1 log creation error:", error);
      res.status(400).json({ error: "Invalid GLP-1 log data" });
    }
  });

  app.delete("/api/glp1-logs/:id", async (req, res) => {
    try {
      await storage.deleteGlp1Log(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete GLP-1 log" });
    }
  });

  // ─── Side Effect Logs ─────────────────────────────────────────────────────
  app.get("/api/side-effect-logs", async (req, res) => {
    try {
      const logs = await storage.getSideEffectLogs(currentUserId);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch side effect logs" });
    }
  });

  app.get("/api/side-effect-logs/today", async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const log = await storage.getTodaySideEffectLog(currentUserId, today);
      res.json(log || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch today's side effect log" });
    }
  });

  app.post("/api/side-effect-logs", async (req, res) => {
    try {
      const validatedData = insertSideEffectLogSchema.parse({ ...req.body, userId: currentUserId });
      const existing = await storage.getTodaySideEffectLog(currentUserId, validatedData.date);
      if (existing) {
        return res.status(409).json({ error: "A journal entry already exists for this date. Use PATCH to update it.", existingId: existing.id });
      }
      const log = await storage.createSideEffectLog(validatedData);
      res.json(log);
    } catch (error) {
      console.error("Side effect log creation error:", error);
      res.status(400).json({ error: "Invalid side effect log data" });
    }
  });

  app.patch("/api/side-effect-logs/:id", async (req, res) => {
    try {
      const log = await storage.updateSideEffectLog(parseInt(req.params.id), req.body);
      res.json(log);
    } catch (error) {
      res.status(500).json({ error: "Failed to update side effect log" });
    }
  });

  app.get("/api/side-effect-logs/range", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) return res.status(400).json({ error: "Start date and end date are required" });
      const logs = await storage.getSideEffectLogsForDateRange(currentUserId, startDate as string, endDate as string);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch side effect logs for date range" });
    }
  });

  // ─── Progress Photos ──────────────────────────────────────────────────────
  app.get("/api/progress-photos", async (req, res) => {
    try {
      const photos = await storage.getProgressPhotos(currentUserId);
      res.json(photos);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch progress photos" });
    }
  });

  app.post("/api/progress-photos", async (req, res) => {
    try {
      const cleanBody = Object.fromEntries(
        Object.entries(req.body).filter(([_, v]) => v !== null && v !== undefined)
      );
      const validatedData = insertProgressPhotoSchema.parse({ ...cleanBody, userId: currentUserId });
      const photo = await storage.createProgressPhoto(validatedData);
      res.json(photo);
    } catch (error) {
      console.error("Progress photo creation error:", error);
      res.status(400).json({ error: "Invalid progress photo data" });
    }
  });

  app.delete("/api/progress-photos/:id", async (req, res) => {
    try {
      await storage.deleteProgressPhoto(parseInt(req.params.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete progress photo" });
    }
  });

  // ─── Push Notifications ───────────────────────────────────────────────────
  app.get("/api/push/vapid-public-key", (req, res) => {
    if (!VAPID_PUBLIC_KEY) return res.status(503).json({ error: "Push notifications not configured" });
    res.json({ key: VAPID_PUBLIC_KEY });
  });

  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "Invalid subscription data" });
      }
      const sub = await storage.upsertPushSubscription({
        userId: currentUserId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      });
      res.json({ success: true, id: sub.id });
    } catch (error) {
      res.status(500).json({ error: "Failed to save push subscription" });
    }
  });

  app.delete("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove subscription" });
    }
  });

  app.post("/api/push/send-reminder", async (req, res) => {
    try {
      const user = await storage.getUser(currentUserId);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.reminderEnabled) return res.json({ sent: false, reason: "reminders disabled" });
      if (!isInjectionDayToday(user.glp1InjectionDay)) {
        return res.json({ sent: false, reason: "not injection day" });
      }

      const subs = await storage.getPushSubscriptions(currentUserId);
      if (subs.length === 0) return res.json({ sent: false, reason: "no subscriptions" });

      const drugName = user.glp1Drug ?? "GLP-1";
      const payload = JSON.stringify({
        title: "LevelTrack Reminder",
        body: `Time for your ${drugName} shot 💉`,
        icon: "/icon-192.png",
        url: "/log-shot",
      });

      const results = await Promise.allSettled(
        subs.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        )
      );
      const sent = results.filter((r) => r.status === "fulfilled").length;
      res.json({ sent, total: subs.length });
    } catch (error) {
      res.status(500).json({ error: "Failed to send reminder" });
    }
  });

  // Check if today is an injection day for the current user (used for in-app banner)
  app.get("/api/push/is-injection-day", async (req, res) => {
    try {
      const user = await storage.getUser(currentUserId);
      if (!user) return res.json({ isInjectionDay: false });
      res.json({ isInjectionDay: isInjectionDayToday(user.glp1InjectionDay) });
    } catch (error) {
      res.status(500).json({ error: "Failed to check injection day" });
    }
  });

  // ─── Debug endpoints ──────────────────────────────────────────────────────
  app.get("/api/debug/db-test", async (req, res) => {
    try {
      const protocols = await storage.getProtocols(currentUserId);
      res.json({ success: true, protocolCount: protocols.length, currentUserId });
    } catch (error) {
      res.status(500).json({ error: "Database connection failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
