import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Syringe, CheckCircle2, Circle, TrendingDown, TrendingUp, Flame, AlertCircle, ChevronRight, Activity, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/date-utils";
import { formatWeight, convertWeight } from "@/lib/weight-utils";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { User, Task, ProtocolItem, Protocol, Glp1Log, ProgressPhoto } from "@shared/schema";
import OnboardingWizard from "@/components/onboarding-wizard";

interface DashboardData {
  todayCompliance: number;
  weekCompliance: number;
  todayTasks: number;
  completedTasks: number;
  sleepHours: number;
  mood: string;
  energy: number;
  todayShotLogged: boolean;
  todayShot: { drugName: string; doseAmount: number; doseUnit: string; injectionSite?: string } | null;
  latestShot: { drugName: string; doseAmount: number; doseUnit: string; date: string } | null;
  glp1Adherence: number;
  latestWeight: number | null;
  totalWeightLost: number | null;
  weeklyData: Array<{ date: string; compliance: number }>;
}

// SVG half-circle gauge component
function InjectionGauge({ progress, isToday, shotLogged }: { progress: number; isToday: boolean; shotLogged: boolean }) {
  const r = 70;
  const cx = 100;
  const cy = 95;
  const p = Math.max(0, Math.min(1, progress));

  const endAngle = Math.PI - p * Math.PI;
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy - r * Math.sin(endAngle);

  const gaugeColor = shotLogged
    ? "#22c55e"
    : p >= 1 ? "#ef4444"
    : p >= 0.8 ? "#f97316"
    : p >= 0.5 ? "#eab308"
    : "#14B8A6";

  const label = shotLogged
    ? "Injected ✓"
    : p >= 1 ? "Due Now!"
    : p >= 0.8 ? "Almost due"
    : p >= 0.5 ? "Halfway"
    : "Recently dosed";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 115" className="w-56 h-32">
        {/* Background track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke="#e5e7eb" strokeWidth="14" strokeLinecap="round"
        />
        {/* Progress fill */}
        {p > 0 && (
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${endX} ${endY}`}
            fill="none" stroke={gaugeColor} strokeWidth="14" strokeLinecap="round"
          />
        )}
        {/* Center label */}
        <text x={cx} y={cy - 20} textAnchor="middle" className="fill-current" style={{ fontSize: 11, fill: '#6b7280' }}>
          {label}
        </text>
        {/* Needle dot at end */}
        {p > 0 && (
          <circle cx={endX} cy={endY} r={6} fill={gaugeColor} />
        )}
        {/* Left label */}
        <text x={cx - r - 4} y={cy + 18} textAnchor="middle" style={{ fontSize: 9, fill: '#9ca3af' }}>0</text>
        {/* Right label */}
        <text x={cx + r + 4} y={cy + 18} textAnchor="middle" style={{ fontSize: 9, fill: '#9ca3af' }}>Due</text>
      </svg>
      {isToday && !shotLogged && (
        <p className="text-xs font-bold text-red-500 -mt-1 mb-1 tracking-wide uppercase">Today is Shot Day!</p>
      )}
    </div>
  );
}

// Progress ring for goal weight
function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const fill = circ - (Math.max(0, Math.min(100, percent)) / 100) * circ;
  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke="hsl(175,60%,42%)" strokeWidth="7"
          strokeDasharray={circ} strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span className="text-xs font-bold text-foreground leading-tight text-center">{label}</span>
    </div>
  );
}

// Pharmacokinetic medication levels chart
const MED_TABS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

function MedLevelsChart({ logs, drug }: { logs: Glp1Log[]; drug: string | null | undefined }) {
  const [tabIdx, setTabIdx] = useState(1); // default 30d
  const days = MED_TABS[tabIdx].days;

  const chartData = useMemo(() => {
    const halfLife = drug?.toLowerCase().includes("tirzepatide") ? 5 : 7; // days
    const today = new Date();
    const data: { date: string; level: number }[] = [];
    for (let i = days; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split("T")[0];
      let level = 0;
      for (const log of logs) {
        const logDate = new Date(log.date);
        const diff = (d.getTime() - logDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diff >= 0) {
          level += (log.doseAmount || 1) * Math.pow(0.5, diff / halfLife);
        }
      }
      data.push({ date: dayStr.slice(5), level: Math.round(level * 100) / 100 });
    }
    return data;
  }, [logs, drug, days]);

  const hasData = logs.length > 0;
  const tickInterval = days <= 7 ? 1 : days <= 30 ? 6 : 14;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-primary" />
            <span className="text-sm font-bold text-foreground">Medication Levels</span>
          </div>
          <div className="flex gap-1">
            {MED_TABS.map((t, i) => (
              <button
                key={t.label}
                onClick={() => setTabIdx(i)}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                  tabIdx === i
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {hasData ? (
          <ResponsiveContainer width="100%" height={100}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
              <defs>
                <linearGradient id="medGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(247,72%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(247,72%,55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={tickInterval} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, padding: "4px 8px" }}
                formatter={(val: number) => [`${val.toFixed(2)} mg`, "Level"]}
              />
              <Area
                type="monotone" dataKey="level" stroke="hsl(247,72%,55%)"
                fill="url(#medGrad)" strokeWidth={2} dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-24 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Log your first shot to see medication levels</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const today = formatDate(new Date());

  // Trigger device sync on dashboard load so weight/recovery data is fresh
  useEffect(() => {
    apiRequest("POST", "/api/integrations/auto-sync", {})
      .then((res) => res.json())
      .then((data: { withingsRan?: boolean; ouraRan?: boolean; withingsSynced?: boolean; ouraSynced?: boolean }) => {
        if (data.withingsRan || data.withingsSynced) {
          queryClient.invalidateQueries({ queryKey: ["/api/progress-photos"] });
          queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
        }
        if (data.ouraRan || data.ouraSynced) {
          queryClient.invalidateQueries({ queryKey: ["/api/oura-daily"] });
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: user } = useQuery<User>({ queryKey: ['/api/user'] });
  const { data: dashboardData, isLoading } = useQuery<DashboardData>({ queryKey: ['/api/analytics/dashboard'] });
  const { data: glp1Logs = [] } = useQuery<Glp1Log[]>({ queryKey: ['/api/glp1-logs'] });
  const { data: progressPhotos = [] } = useQuery<ProgressPhoto[]>({ queryKey: ['/api/progress-photos'] });

  const { data: todayTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { date: today }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?date=${today}`);
      return response.json();
    },
  });

  const { data: protocols = [] } = useQuery<Protocol[]>({ queryKey: ['/api/protocols'] });

  const { data: protocolItems = [] } = useQuery<ProtocolItem[]>({
    queryKey: ['/api/protocol-items'],
    queryFn: async () => {
      const allItems = [];
      for (const protocol of protocols) {
        const items = await fetch(`/api/protocols/${protocol.id}/items`).then(res => res.json());
        allItems.push(...items);
      }
      return allItems;
    },
    enabled: protocols.length > 0,
  });

  const { data: injectionDayData } = useQuery<{ isInjectionDay: boolean }>({
    queryKey: ["/api/push/is-injection-day"],
  });

  const generateTasksMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiRequest("POST", "/api/tasks/generate", { date });
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tasks'] }),
  });

  useEffect(() => { generateTasksMutation.mutate(today); }, []);

  useEffect(() => {
    if (!onboardingChecked && user !== undefined) {
      setOnboardingChecked(true);
      // Show onboarding if not completed OR if GLP-1 settings are missing
      const missingGlp1 = !user?.glp1Drug || !user?.glp1InjectionFrequency;
      if (!user?.hasCompletedOnboarding || missingGlp1) {
        setShowOnboarding(true);
      }
    }
  }, [user, onboardingChecked]);

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, { completed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update task", variant: "destructive" }),
  });

  const weightUnit = user?.weightUnit ?? "lbs";
  const isInjectionDay = injectionDayData?.isInjectionDay ?? false;
  const shotLogged = dashboardData?.todayShotLogged ?? false;

  // Gauge: compute days since last injection / interval
  const gaugeProgress = useMemo(() => {
    if (!dashboardData?.latestShot?.date) return 0;
    const lastDate = new Date(dashboardData.latestShot.date);
    const now = new Date();
    const daysSince = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
    const freq = user?.glp1InjectionFrequency;
    const interval = freq === "biweekly" ? 14 : freq === "daily" ? 1 : 7;
    return daysSince / interval;
  }, [dashboardData?.latestShot, user?.glp1InjectionFrequency]);

  // BMI calculation
  const bmi = useMemo(() => {
    if (!user?.heightCm || !dashboardData?.latestWeight) return null;
    const weightKg = weightUnit === "kg" ? dashboardData.latestWeight : dashboardData.latestWeight * 0.453592;
    const heightM = user.heightCm / 100;
    return weightKg / (heightM * heightM);
  }, [user?.heightCm, dashboardData?.latestWeight, weightUnit]);

  // Goal progress ring
  const goalProgressPct = useMemo(() => {
    if (!user?.goalWeight || !dashboardData?.latestWeight || !dashboardData.totalWeightLost) return null;
    const startWeight = dashboardData.latestWeight + dashboardData.totalWeightLost;
    const range = startWeight - user.goalWeight;
    if (range <= 0) return 100;
    return Math.round(((startWeight - dashboardData.latestWeight) / range) * 100);
  }, [user?.goalWeight, dashboardData?.latestWeight, dashboardData?.totalWeightLost]);

  const weightLost = dashboardData?.totalWeightLost
    ? convertWeight(dashboardData.totalWeightLost, weightUnit)
    : null;

  // Rate/week: average weight change over last 4 weigh-ins
  const ratePerWeek = useMemo(() => {
    const withWeight = progressPhotos
      .filter((p) => p.weight != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (withWeight.length < 2) return null;
    const last4 = withWeight.slice(-4);
    const oldest = last4[0];
    const newest = last4[last4.length - 1];
    const days = (new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= 0) return null;
    const totalChange = (newest.weight! - oldest.weight!); // positive = gained
    const perWeek = (totalChange / days) * 7;
    return convertWeight(perWeek, weightUnit);
  }, [progressPhotos, weightUnit]);

  // Week streak display — show weeks when >= 7 days
  const streakValue = user?.streak ?? 0;
  const streakDisplay = streakValue >= 7
    ? `${Math.floor(streakValue / 7)}wk`
    : `${streakValue}d`;
  const streakLabel = streakValue >= 7
    ? `${Math.floor(streakValue / 7)} week streak`
    : `${streakValue} day streak`;

  const hasGlp1Setup = !!user?.glp1Drug;

  const getGreeting = () => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  };

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => {
            setShowOnboarding(false);
            queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          }}
        />
      )}

      <div className="px-4 py-4 space-y-4">

        {/* Greeting */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{getGreeting()},</p>
            <h2 className="text-xl font-bold text-foreground leading-tight">{user?.name || "there"}</h2>
          </div>
          <div
            className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5"
            title={streakLabel}
          >
            <Flame size={14} className="text-amber-500" />
            <span className="text-xs font-bold text-amber-700">{streakDisplay} streak</span>
          </div>
        </div>

        {/* Injection Gauge Hero */}
        {hasGlp1Setup && (
          <Card className="overflow-hidden">
            <CardContent className="p-4 flex flex-col items-center">
              <InjectionGauge
                progress={shotLogged ? 0 : gaugeProgress}
                isToday={isInjectionDay}
                shotLogged={shotLogged}
              />
              <div className="w-full mt-1">
                {shotLogged ? (
                  <div className="flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2">
                    <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-800">Shot logged today</p>
                      <p className="text-xs text-green-600">
                        {dashboardData?.todayShot?.drugName} {dashboardData?.todayShot?.doseAmount}{dashboardData?.todayShot?.doseUnit}
                      </p>
                    </div>
                    <Button
                      size="sm" variant="ghost"
                      className="text-green-700 h-7 px-2 text-xs"
                      onClick={() => setLocation("/log-shot")}
                    >Edit</Button>
                  </div>
                ) : (
                  <Button
                    className="w-full gradient-primary text-white font-semibold h-10"
                    onClick={() => setLocation("/log-shot")}
                  >
                    <Syringe size={15} className="mr-2" />
                    {isInjectionDay ? "Log Today's Shot" : "Log Shot"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Weight Hero Card */}
        {(weightLost != null || goalProgressPct != null) && (
          <div className="gradient-primary rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs opacity-70 mb-0.5">Total weight lost</p>
                <div className="flex items-baseline gap-2">
                  {weightLost != null && weightLost > 0 ? (
                    <>
                      <span className="text-4xl font-black">{weightLost.toFixed(1)}</span>
                      <span className="text-lg font-medium opacity-80">{weightUnit}</span>
                      <TrendingDown size={22} className="text-green-300" />
                    </>
                  ) : (
                    <span className="text-2xl font-bold opacity-60">Log your weight to start</span>
                  )}
                </div>
                {dashboardData?.latestWeight && (
                  <p className="text-xs opacity-70 mt-1">
                    Current: {formatWeight(dashboardData.latestWeight, weightUnit)}
                    {user?.goalWeight && (
                      <> · Goal: {formatWeight(user.goalWeight, weightUnit)}</>
                    )}
                  </p>
                )}
              </div>
              {goalProgressPct != null && (
                <ProgressRing
                  percent={goalProgressPct}
                  label={`${goalProgressPct}%\nto goal`}
                />
              )}
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="cursor-pointer active:scale-95 transition-transform" onClick={() => setLocation("/analytics")}>
            <CardContent className="p-2.5 text-center">
              <div className="text-base font-bold text-primary">
                {dashboardData?.glp1Adherence ?? 0}%
              </div>
              <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">Adherence</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer active:scale-95 transition-transform" onClick={() => setLocation("/analytics")}>
            <CardContent className="p-2.5 text-center">
              <div className="text-base font-bold text-secondary">
                {glp1Logs.length}
              </div>
              <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">Shots</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer active:scale-95 transition-transform">
            <CardContent className="p-2.5 text-center">
              <div className="text-base font-bold text-amber-500">
                {bmi != null ? bmi.toFixed(1) : "—"}
              </div>
              <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">BMI</div>
            </CardContent>
          </Card>
          <Card className="cursor-pointer active:scale-95 transition-transform" onClick={() => setLocation("/analytics")}>
            <CardContent className="p-2.5 text-center">
              {ratePerWeek != null ? (
                <div className={`text-base font-bold flex items-center justify-center gap-0.5 ${ratePerWeek < 0 ? "text-green-500" : "text-red-400"}`}>
                  {ratePerWeek < 0
                    ? <TrendingDown size={12} />
                    : <TrendingUp size={12} />}
                  {Math.abs(ratePerWeek).toFixed(1)}
                </div>
              ) : (
                <div className="text-base font-bold text-muted-foreground">—</div>
              )}
              <div className="text-[9px] text-muted-foreground leading-tight mt-0.5">
                {weightUnit}/wk
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Fallback banner if no GLP-1 setup */}
        {!hasGlp1Setup && !isLoading && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-center gap-3">
              <Target size={20} className="text-primary shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Set up your medication</p>
                <p className="text-xs text-muted-foreground">Add your GLP-1 or peptide to get started</p>
              </div>
              <Button size="sm" className="gradient-primary text-white text-xs h-8"
                onClick={() => setShowOnboarding(true)}>
                Setup
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Injection day banner as fallback (when push reminders not enabled) */}
        {isInjectionDay && !shotLogged && !user?.reminderEnabled && hasGlp1Setup && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Syringe size={16} className="text-amber-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Shot day reminder</p>
              <p className="text-xs text-amber-600">
                Today is your {user?.glp1InjectionDay} injection day{user?.glp1Drug ? ` — ${user.glp1Drug}` : ""}.
              </p>
            </div>
          </div>
        )}

        {/* Medication Levels Chart */}
        {hasGlp1Setup && glp1Logs.length > 0 && (
          <MedLevelsChart logs={glp1Logs} drug={user?.glp1Drug} />
        )}

        {/* Today's Supplement Stack */}
        {todayTasks.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">Today's Stack</h3>
                <Badge variant="secondary" className="text-xs">
                  {dashboardData?.completedTasks || 0}/{dashboardData?.todayTasks || 0} done
                </Badge>
              </div>
              <div className="space-y-2">
                {todayTasks.map((task) => {
                  const item = protocolItems.find(i => i.id === task.protocolItemId);
                  if (!item) return null;
                  return (
                    <div key={task.id} className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${task.completed ? 'bg-green-50' : 'bg-muted/50'}`}>
                      <button
                        onClick={() => toggleTaskMutation.mutate({ taskId: task.id, completed: !task.completed })}
                        className="flex-shrink-0 touch-target flex items-center justify-center"
                      >
                        {task.completed
                          ? <CheckCircle2 size={20} className="text-green-500" />
                          : <Circle size={20} className="text-muted-foreground" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {item.name}
                        </p>
                        {item.dosageAmount && (
                          <p className="text-xs text-muted-foreground">{item.dosageAmount}{item.dosageUnit}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {todayTasks.length === 0 && !isLoading && (
          <Card>
            <CardContent className="p-5 text-center">
              <AlertCircle size={28} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm font-medium text-foreground">No stack items today</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add supplements to your protocol to track them here</p>
              <Button variant="outline" size="sm" className="mt-3 text-xs h-8"
                onClick={() => setLocation("/protocols")}>
                <ChevronRight size={12} className="mr-1" />
                Go to Protocols
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </>
  );
}
