import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BookOpen, CheckCircle2, Edit3, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { SideEffectLog } from "@shared/schema";

interface SymptomConfig {
  key: keyof SymptomScores;
  label: string;
  low: string;
  high: string;
  emoji: string;
}

interface SymptomScores {
  nausea: number;
  gi: number;
  fatigue: number;
  mood: number;
  cravings: number;
  sleep: number;
  energy: number;
}

const SYMPTOMS: SymptomConfig[] = [
  { key: "nausea", label: "Nausea", low: "None", high: "Severe", emoji: "🤢" },
  { key: "gi", label: "GI Discomfort", low: "None", high: "Severe", emoji: "😣" },
  { key: "fatigue", label: "Fatigue", low: "None", high: "Exhausted", emoji: "😴" },
  { key: "mood", label: "Mood", low: "Low", high: "Great", emoji: "😊" },
  { key: "cravings", label: "Cravings", low: "None", high: "Intense", emoji: "🍔" },
  { key: "sleep", label: "Sleep Quality", low: "Poor", high: "Great", emoji: "🌙" },
  { key: "energy", label: "Energy", low: "Low", high: "High", emoji: "⚡" },
];

const DEFAULT_SCORES: SymptomScores = {
  nausea: 1,
  gi: 1,
  fatigue: 1,
  mood: 3,
  cravings: 1,
  sleep: 3,
  energy: 3,
};

// Score color: for negative symptoms (nausea, gi, fatigue, cravings): low=good, high=bad
// For positive symptoms (mood, sleep, energy): low=bad, high=good
const NEGATIVE_SYMPTOMS = new Set(["nausea", "gi", "fatigue", "cravings"]);

function getScoreColor(key: string, score: number): string {
  const isNegative = NEGATIVE_SYMPTOMS.has(key);
  if (isNegative) {
    // Lower is better
    if (score === 1) return "bg-green-500 text-white border-green-500";
    if (score === 2) return "bg-green-400 text-white border-green-400";
    if (score === 3) return "bg-yellow-400 text-white border-yellow-400";
    if (score === 4) return "bg-orange-400 text-white border-orange-400";
    return "bg-red-500 text-white border-red-500";
  } else {
    // Higher is better
    if (score === 1) return "bg-red-500 text-white border-red-500";
    if (score === 2) return "bg-orange-400 text-white border-orange-400";
    if (score === 3) return "bg-yellow-400 text-white border-yellow-400";
    if (score === 4) return "bg-green-400 text-white border-green-400";
    return "bg-green-500 text-white border-green-500";
  }
}

function ScoreRow({ config, value, onChange }: {
  config: SymptomConfig;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">{config.emoji}</span>
          <Label className="text-sm font-medium">{config.label}</Label>
        </div>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`w-9 h-9 rounded-xl border-2 text-sm font-bold transition-all touch-target flex items-center justify-center ${
                value === v
                  ? getScoreColor(config.key, v)
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
        <span>{config.low}</span>
        <span>{config.high}</span>
      </div>
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function HistoryEntry({ log }: { log: SideEffectLog }) {
  const scores = [
    { key: "nausea", label: "Nausea", value: log.nausea, emoji: "🤢" },
    { key: "gi", label: "GI", value: log.gi, emoji: "😣" },
    { key: "fatigue", label: "Fatigue", value: log.fatigue, emoji: "😴" },
    { key: "mood", label: "Mood", value: log.mood, emoji: "😊" },
    { key: "cravings", label: "Cravings", value: log.cravings, emoji: "🍔" },
    { key: "sleep", label: "Sleep", value: log.sleep, emoji: "🌙" },
    { key: "energy", label: "Energy", value: log.energy, emoji: "⚡" },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-semibold text-foreground">{formatDate(log.date)}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(log.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {scores.map(({ key, label, value, emoji }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-xs">{emoji}</span>
              <span
                className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center ${
                  value != null ? getScoreColor(key, value!) : "bg-muted text-muted-foreground"
                }`}
              >
                {value ?? "—"}
              </span>
              <span className="text-[9px] text-muted-foreground text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
        {log.freeText && (
          <p className="text-xs text-muted-foreground italic mt-2.5 pt-2 border-t line-clamp-2">
            {log.freeText}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Journal() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split("T")[0];

  const [scores, setScores] = useState<SymptomScores>({ ...DEFAULT_SCORES });
  const [note, setNote] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: logs = [], isLoading } = useQuery<SideEffectLog[]>({
    queryKey: ["/api/side-effect-logs"],
  });

  const todayLog = logs.find((l) => l.date === today);
  const recentLogs = logs.slice(0, 7);

  const updateScore = (key: keyof SymptomScores, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = () => {
    if (todayLog) {
      setScores({
        nausea: todayLog.nausea ?? 1,
        gi: todayLog.gi ?? 1,
        fatigue: todayLog.fatigue ?? 1,
        mood: todayLog.mood ?? 3,
        cravings: todayLog.cravings ?? 1,
        sleep: todayLog.sleep ?? 3,
        energy: todayLog.energy ?? 3,
      });
      setNote(todayLog.freeText ?? "");
    }
    setIsEditing(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/side-effect-logs", {
        date: today,
        ...scores,
        freeText: note || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/side-effect-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      setIsEditing(false);
      toast({ title: "Journal saved!", description: "Your symptom check-in has been recorded." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save journal entry.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/side-effect-logs/${todayLog!.id}`, {
        ...scores,
        freeText: note || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/side-effect-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      setIsEditing(false);
      toast({ title: "Updated!", description: "Today's entry has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update journal entry.", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (todayLog && isEditing) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const showForm = !todayLog || isEditing;

  return (
    <div className="px-4 py-5 space-y-5">

      {/* Today's check-in card */}
      {todayLog && !isEditing ? (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
                  <CheckCircle2 size={18} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Today's check-in done</p>
                  <p className="text-xs text-muted-foreground">All 7 symptoms logged</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
                <Edit3 size={13} />
                Edit
              </Button>
            </div>
            <HistoryEntry log={todayLog} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-5 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center shrink-0">
                <BookOpen className="text-white" size={16} />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground leading-tight">
                  {isEditing ? "Edit Today's Check-in" : "Today's Symptom Check-in"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {SYMPTOMS.map((s) => (
                <ScoreRow
                  key={s.key}
                  config={s}
                  value={scores[s.key]}
                  onChange={(v) => updateScore(s.key, v)}
                />
              ))}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                placeholder="How are you feeling? Any observations about today..."
                className="resize-none text-sm"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              {isEditing && (
                <Button
                  variant="outline"
                  className="flex-1 h-12"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              )}
              <Button
                className="flex-1 h-12 text-sm font-semibold gradient-primary text-white border-0"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? "Saving..." : isEditing ? "Update Entry" : "Save Check-in"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent history */}
      {recentLogs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Recent Entries</h3>
            <span className="text-xs text-muted-foreground">Last {recentLogs.length} days</span>
          </div>

          {isLoading ? (
            <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">Loading...</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {recentLogs
                .filter((l) => l.date !== today || !todayLog)
                .map((log) => (
                  <HistoryEntry key={log.id} log={log} />
                ))}
            </div>
          )}
        </div>
      )}

      {!isLoading && logs.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle size={32} className="mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No journal entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">Complete your first check-in above</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
