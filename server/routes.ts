import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
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
  console.log("[push] VAPID keys configured — push notifications enabled");
} else {
  if (!VAPID_PUBLIC_KEY) console.warn("[push] VAPID_PUBLIC_KEY not set — push notifications disabled");
  if (!VAPID_PRIVATE_KEY) console.warn("[push] VAPID_PRIVATE_KEY not set — push notifications disabled. Set this secret to enable shot reminders.");
}
export const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

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
  heightCm: z.number().positive().optional().nullable(),
  theme: z.enum(["light", "dark", "system"]).optional(),
});

const peptideCalcSchema = z.object({
  name: z.string().min(1),
  peptides: z.array(z.object({
    name: z.string(),
    amountMg: z.number().positive(),
    desiredDoseMcg: z.number().positive(),
  })).min(1),
  bacWaterMl: z.number().positive(),
  syringeType: z.enum(["U-100", "U-40"]).default("U-100"),
  injectionSchedule: z.string().optional(),
  notes: z.string().optional(),
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

  // ─── Peptide Calculator routes ────────────────────────────────────────────
  app.get("/api/peptide-calcs", async (req, res) => {
    try {
      const calcs = await storage.getPeptideCalculations(currentUserId);
      const withLogs = await Promise.all(calcs.map(async (calc) => {
        const logs = await storage.getVialLogs(calc.id);

        // Compute true consecutive-day streak from loggedAt timestamps
        const logDates = Array.from(new Set(
          logs
            .filter(l => l.loggedAt != null)
            .map(l => new Date(l.loggedAt!).toISOString().split("T")[0])
        )).sort().reverse(); // most recent first

        let streak = 0;
        const today = new Date().toISOString().split("T")[0];
        let expected = today;
        for (const d of logDates) {
          if (d === expected) {
            streak++;
            const prev = new Date(expected);
            prev.setDate(prev.getDate() - 1);
            expected = prev.toISOString().split("T")[0];
          } else if (d < expected) {
            break;
          }
        }

        return {
          ...calc,
          logCount: logs.length,
          lastLoggedAt: logs[0]?.loggedAt ?? null,
          streak,
        };
      }));
      res.json(withLogs);
    } catch { res.status(500).json({ error: "Failed to fetch peptide calculations" }); }
  });

  app.post("/api/peptide-calcs", async (req, res) => {
    try {
      const data = peptideCalcSchema.parse(req.body);
      const calc = await storage.createPeptideCalculation({ ...data, userId: currentUserId });
      res.json(calc);
    } catch (e) { res.status(400).json({ error: "Invalid data" }); }
  });

  app.patch("/api/peptide-calcs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const data = peptideCalcSchema.partial().parse(req.body);
      const calc = await storage.updatePeptideCalculation(id, data as Parameters<typeof storage.updatePeptideCalculation>[1]);
      res.json(calc);
    } catch { res.status(400).json({ error: "Failed to update" }); }
  });

  app.delete("/api/peptide-calcs/:id", async (req, res) => {
    try {
      await storage.deletePeptideCalculation(parseInt(req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete" }); }
  });

  app.get("/api/peptide-calcs/:id/logs", async (req, res) => {
    try {
      const logs = await storage.getVialLogs(parseInt(req.params.id));
      res.json(logs);
    } catch { res.status(500).json({ error: "Failed to fetch logs" }); }
  });

  app.post("/api/peptide-calcs/:id/logs", async (req, res) => {
    try {
      const log = await storage.createVialLog(parseInt(req.params.id), currentUserId);
      res.json(log);
    } catch { res.status(500).json({ error: "Failed to log dose" }); }
  });

  app.delete("/api/peptide-calcs/:id/logs/last", async (req, res) => {
    try {
      await storage.deleteLastVialLog(parseInt(req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to undo" }); }
  });

  // ─── Device Integrations (Withings + Oura) ───────────────────────────────

  // Build a deterministic base URL for OAuth redirect URIs.
  // Prefers APP_BASE_URL env var (set in production) so the URI never
  // depends on the request's protocol/host (which can be wrong behind proxies
  // even with trust proxy enabled if the provider caches redirect URIs).
  function getAppBaseUrl(req: Request): string {
    if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
    return `${req.protocol}://${req.get("host")}`;
  }

  // Per-request OAuth state nonces (server-side CSRF protection)
  // Map of state → { platform, expiresAt }
  const oauthStates = new Map<string, { platform: string; expiresAt: number }>();
  function generateOAuthState(platform: string): string {
    const state = randomBytes(24).toString("hex");
    oauthStates.set(state, { platform, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5-min TTL
    // Prune expired states
    for (const [k, v] of oauthStates) { if (Date.now() > v.expiresAt) oauthStates.delete(k); }
    return state;
  }
  function validateOAuthState(state: string, expectedPlatform: string): boolean {
    const entry = oauthStates.get(state);
    if (!entry) return false;
    oauthStates.delete(state); // single-use
    return entry.platform === expectedPlatform && Date.now() < entry.expiresAt;
  }

  // Auto-sync endpoint — awaits sync completion so client can reliably invalidate queries
  app.post("/api/integrations/auto-sync", async (req, res) => {
    try {
      const { syncWithingsWeights, syncOuraSleep } = await import("./device-sync");
      const ONE_HOUR_MS = 60 * 60 * 1000;

      const [withingsInt, ouraInt] = await Promise.all([
        storage.getIntegrationByPlatform(currentUserId, "withings"),
        storage.getIntegrationByPlatform(currentUserId, "oura"),
      ]);

      const withingsStale = withingsInt?.isActive && withingsInt?.accessToken &&
        (Date.now() - (withingsInt.lastSync ? new Date(withingsInt.lastSync).getTime() : 0)) > ONE_HOUR_MS;
      const ouraStale = ouraInt?.isActive && ouraInt?.accessToken &&
        (Date.now() - (ouraInt.lastSync ? new Date(ouraInt.lastSync).getTime() : 0)) > ONE_HOUR_MS;

      const [withingsResult, ouraResult] = await Promise.all([
        withingsStale ? syncWithingsWeights(currentUserId) : Promise.resolve({ synced: 0 }),
        ouraStale ? syncOuraSleep(currentUserId) : Promise.resolve({ synced: 0 }),
      ]);

      res.json({
        withingsRan: !!withingsStale,
        ouraRan: !!ouraStale,
        withingsSynced: (withingsResult.synced ?? 0) > 0,
        ouraSynced: (ouraResult.synced ?? 0) > 0,
        withingsCount: withingsResult.synced ?? 0,
        ouraCount: ouraResult.synced ?? 0,
      });
    } catch {
      res.json({ withingsSynced: false, ouraSynced: false });
    }
  });

  // Get status of device integrations
  app.get("/api/device-integrations", async (req, res) => {
    try {
      const [withings, oura] = await Promise.all([
        storage.getIntegrationByPlatform(currentUserId, "withings"),
        storage.getIntegrationByPlatform(currentUserId, "oura"),
      ]);
      const withingsEnabled = !!(process.env.WITHINGS_CLIENT_ID && process.env.WITHINGS_CLIENT_SECRET);
      const ouraEnabled = !!(process.env.OURA_CLIENT_ID && process.env.OURA_CLIENT_SECRET);
      res.json({
        withings: {
          connected: !!(withings?.isActive && withings?.accessToken),
          lastSync: withings?.lastSync ?? null,
          configured: withingsEnabled,
        },
        oura: {
          connected: !!(oura?.isActive && oura?.accessToken),
          lastSync: oura?.lastSync ?? null,
          configured: ouraEnabled,
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch device integrations" });
    }
  });

  // ─── Withings OAuth ───────────────────────────────────────────────────────
  app.get("/api/integrations/withings/auth", (req, res) => {
    const clientId = process.env.WITHINGS_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: "Withings integration not configured. Set WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET." });

    const redirectUri = `${getAppBaseUrl(req)}/api/integrations/withings/callback`;
    const state = generateOAuthState("withings");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "user.metrics",
      redirect_uri: redirectUri,
      state,
    });
    res.redirect(`https://account.withings.com/oauth2_user/authorize2?${params.toString()}`);
  });

  app.get("/api/integrations/withings/callback", async (req, res) => {
    const { code, state } = req.query;
    const clientId = process.env.WITHINGS_CLIENT_ID;
    const clientSecret = process.env.WITHINGS_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
      return res.redirect("/settings?error=withings_auth_failed");
    }
    if (!state || !validateOAuthState(state as string, "withings")) {
      return res.redirect("/settings?error=withings_state_invalid");
    }

    try {
      const redirectUri = `${getAppBaseUrl(req)}/api/integrations/withings/callback`;
      const params = new URLSearchParams({
        action: "requesttoken",
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code: code as string,
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch("https://wbsapi.withings.net/v2/oauth2", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const tokenData = await tokenRes.json();

      if (tokenData.status !== 0) {
        return res.redirect("/settings?error=withings_token_failed");
      }

      const expiresAt = tokenData.body.expires_in
        ? Date.now() + tokenData.body.expires_in * 1000
        : undefined;

      await storage.upsertIntegrationByPlatform(currentUserId, "withings", {
        accessToken: tokenData.body.access_token,
        refreshToken: tokenData.body.refresh_token,
        isActive: true,
        settings: { expiresAt },
      });

      // Trigger initial sync in background
      const { syncWithingsWeights } = await import("./device-sync");
      syncWithingsWeights(currentUserId).catch(console.error);

      res.redirect("/settings?connected=withings");
    } catch {
      res.redirect("/settings?error=withings_callback_failed");
    }
  });

  app.delete("/api/integrations/withings", async (req, res) => {
    try {
      await storage.deleteIntegrationByPlatform(currentUserId, "withings");
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect Withings" });
    }
  });

  app.post("/api/integrations/withings/sync", async (req, res) => {
    try {
      const { syncWithingsWeights } = await import("./device-sync");
      const result = await syncWithingsWeights(currentUserId);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // ─── Oura OAuth ────────────────────────────────────────────────────────────
  app.get("/api/integrations/oura/auth", (req, res) => {
    const clientId = process.env.OURA_CLIENT_ID;
    if (!clientId) return res.status(503).json({ error: "Oura integration not configured. Set OURA_CLIENT_ID and OURA_CLIENT_SECRET." });

    const redirectUri = `${getAppBaseUrl(req)}/api/integrations/oura/callback`;
    const state = generateOAuthState("oura");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "daily email personal",
      redirect_uri: redirectUri,
      state,
    });
    res.redirect(`https://cloud.ouraring.com/oauth/authorize?${params.toString()}`);
  });

  app.get("/api/integrations/oura/callback", async (req, res) => {
    const { code, state } = req.query;
    const clientId = process.env.OURA_CLIENT_ID;
    const clientSecret = process.env.OURA_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
      return res.redirect("/settings?error=oura_auth_failed");
    }
    if (!state || !validateOAuthState(state as string, "oura")) {
      return res.redirect("/settings?error=oura_state_invalid");
    }

    try {
      const redirectUri = `${getAppBaseUrl(req)}/api/integrations/oura/callback`;
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const tokenRes = await fetch("https://api.ouraring.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        return res.redirect("/settings?error=oura_token_failed");
      }

      const expiresAt = tokenData.expires_in
        ? Date.now() + tokenData.expires_in * 1000
        : undefined;

      await storage.upsertIntegrationByPlatform(currentUserId, "oura", {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        isActive: true,
        settings: { expiresAt },
      });

      // Trigger initial sync in background
      const { syncOuraSleep } = await import("./device-sync");
      syncOuraSleep(currentUserId).catch(console.error);

      res.redirect("/settings?connected=oura");
    } catch {
      res.redirect("/settings?error=oura_callback_failed");
    }
  });

  app.delete("/api/integrations/oura", async (req, res) => {
    try {
      await storage.deleteIntegrationByPlatform(currentUserId, "oura");
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect Oura" });
    }
  });

  app.post("/api/integrations/oura/sync", async (req, res) => {
    try {
      const { syncOuraSleep } = await import("./device-sync");
      const result = await syncOuraSleep(currentUserId);
      res.json(result);
    } catch {
      res.status(500).json({ error: "Sync failed" });
    }
  });

  // ─── Oura Daily Logs ──────────────────────────────────────────────────────
  app.get("/api/oura-daily", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const logs = await storage.getOuraDailyLogs(
        currentUserId,
        startDate as string | undefined,
        endDate as string | undefined
      );
      res.json(logs);
    } catch {
      res.status(500).json({ error: "Failed to fetch Oura data" });
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

// ─── Reminder Scheduler ────────────────────────────────────────────────────
// Runs every minute and sends push notifications to users whose reminderTime
// matches the current HH:MM, have reminders enabled, and it's their injection day.
// Uses a set to track which user/date combos have already been notified today.
const notifiedToday = new Set<string>();

export function startReminderScheduler(): void {
  const tick = async () => {
    try {
      const now = new Date();
      const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const today = now.toISOString().split("T")[0];

      // Reset the dedup set each day
      const dayPrefix = `${today}:`;
      for (const key of notifiedToday) {
        if (!key.startsWith(dayPrefix)) notifiedToday.delete(key);
      }

      // For demo: only user #1. In production, iterate all users.
      const user = await storage.getUser(1);
      if (!user) return;
      if (!user.reminderEnabled) return;
      if (!user.reminderTime || user.reminderTime !== currentHHMM) return;
      if (!isInjectionDayToday(user.glp1InjectionDay)) return;

      const dedupKey = `${today}:${user.id}`;
      if (notifiedToday.has(dedupKey)) return;
      notifiedToday.add(dedupKey);

      const subs = await storage.getPushSubscriptions(user.id);
      if (subs.length === 0) return;

      const drugName = user.glp1Drug ?? "GLP-1";
      const payload = JSON.stringify({
        title: "LevelTrack — Shot Day!",
        body: `Time for your ${drugName} injection 💉 Tap to log it.`,
        icon: "/icon.svg",
        url: "/log-shot",
      });

      await Promise.allSettled(
        subs.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          ).catch(() => {}) // swallow individual failures gracefully
        )
      );
    } catch {
      // scheduler errors should never crash the process
    }
  };

  // Run immediately then every 60 seconds
  tick();
  setInterval(tick, 60_000);
}
