import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
  ReferenceLine, Area, AreaChart, Legend,
} from "recharts";
import type { TooltipProps, DotProps } from "recharts";
import { TrendingDown, Syringe, Activity, AlertCircle, BarChart2, Moon } from "lucide-react";
import { getDateRange } from "@/lib/date-utils";
import { convertWeight } from "@/lib/weight-utils";
import type { HealthMetric, Glp1Log, SideEffectLog, ProgressPhoto, User, OuraDailyLog } from "@shared/schema";

interface DashboardData {
  glp1Adherence: number;
  latestWeight: number | null;
  todayShotLogged: boolean;
  todayShot: { drugName: string; doseAmount: number; doseUnit: string } | null;
  latestShot: { drugName: string; doseAmount: number; doseUnit: string; date: string } | null;
}

type Period = "30" | "90" | "all";

function formatXDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AdherenceRing({ pct }: { pct: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={100} height={100} viewBox="0 0 100 100">
      <circle cx={50} cy={50} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
      <circle
        cx={50} cy={50} r={r} fill="none"
        stroke={color} strokeWidth={10}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text x={50} y={54} textAnchor="middle" fontSize={18} fontWeight={800} fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

const CustomDot = (props: DotProps & { payload?: { injectionDay?: boolean } }) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const isInjection = payload?.injectionDay;
  return (
    <g>
      <circle cx={cx} cy={cy} r={isInjection ? 6 : 4} fill={isInjection ? "#0d9488" : "#3D27CC"} stroke="#fff" strokeWidth={2} />
      {isInjection && <circle cx={cx} cy={cy} r={9} fill="#0d9488" fillOpacity={0.2} />}
    </g>
  );
};

function makeWeightTooltip(unit: string) {
  return function CustomTooltipWeight({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-foreground mb-1">{String(label)}</p>
        {payload.map((p) => (
          <p key={String(p.dataKey)} style={{ color: p.color }}>
            {p.name}: <span className="font-bold">{p.value} {unit}</span>
          </p>
        ))}
      </div>
    );
  };
}

const CustomTooltipSymptom = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}/5</span>
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [period, setPeriod] = useState<Period>("30");

  const days = period === "all" ? 365 : parseInt(period);
  const { startDate, endDate } = getDateRange(days);

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/analytics/dashboard"],
  });

  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const { data: healthMetrics = [] } = useQuery<HealthMetric[]>({
    queryKey: ["/api/health-metrics/range", { startDate, endDate }],
    queryFn: () =>
      fetch(`/api/health-metrics/range?startDate=${startDate}&endDate=${endDate}`).then((r) => r.json()),
  });

  const { data: glp1Logs = [] } = useQuery<Glp1Log[]>({
    queryKey: ["/api/glp1-logs"],
  });

  const { data: sideEffectLogs = [] } = useQuery<SideEffectLog[]>({
    queryKey: ["/api/side-effect-logs"],
  });

  const { data: progressPhotos = [] } = useQuery<ProgressPhoto[]>({
    queryKey: ["/api/progress-photos"],
  });

  const { data: ouraLogs = [] } = useQuery<OuraDailyLog[]>({
    queryKey: ["/api/oura-daily", { startDate, endDate }],
    queryFn: () => fetch(`/api/oura-daily?startDate=${startDate}&endDate=${endDate}`).then(r => r.json()),
  });

  // ─── Weight data: merge health_metrics + progress_photos weights ───────────
  const weightFromMetrics = healthMetrics
    .filter((m) => m.weight != null)
    .map((m) => ({ date: m.date, weight: m.weight! }));

  const weightFromPhotos = progressPhotos
    .filter((p) => p.weight != null)
    .map((p) => ({ date: p.date, weight: p.weight! }));

  const allWeightEntries = [...weightFromMetrics, ...weightFromPhotos]
    .reduce((acc, entry) => {
      const existing = acc.find((e) => e.date === entry.date);
      if (!existing) acc.push(entry);
      return acc;
    }, [] as { date: string; weight: number }[])
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e) => e.date >= startDate && e.date <= endDate);

  const weightUnit = user?.weightUnit ?? "lbs";

  // ─── Dose timeline ─────────────────────────────────────────────────────────
  const filteredLogs = glp1Logs
    .filter((l) => l.date >= startDate && l.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const injectionDates = new Set(filteredLogs.map((l) => l.date));

  const weightChartData = allWeightEntries.map((e) => ({
    date: formatXDate(e.date),
    weight: convertWeight(e.weight, weightUnit),
    injectionDay: injectionDates.has(e.date),
  }));

  const doseData = filteredLogs.map((l) => ({
    date: formatXDate(l.date),
    dose: l.doseAmount,
    drug: l.drugName,
    unit: l.doseUnit,
  }));

  // ─── Side effect trends ────────────────────────────────────────────────────
  const filteredSide = sideEffectLogs
    .filter((l) => l.date >= startDate && l.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const sideData = filteredSide.map((l) => ({
    date: formatXDate(l.date),
    nausea: l.nausea,
    fatigue: l.fatigue,
    mood: l.mood,
    energy: l.energy,
  }));

  // ─── Dose change reference lines for weight chart ─────────────────────────
  // Find dates where dose amount changed (or first shot), formatted to match X axis
  const doseChangeLines = filteredLogs.reduce<{ formattedDate: string; dose: number; drug: string }[]>(
    (acc, log, i) => {
      const prev = filteredLogs[i - 1];
      if (i === 0 || (prev && prev.doseAmount !== log.doseAmount)) {
        acc.push({ formattedDate: formatXDate(log.date), dose: log.doseAmount, drug: log.drugName });
      }
      return acc;
    },
    []
  );

  // ─── Oura recovery chart data ──────────────────────────────────────────────
  const ouraChartData = ouraLogs
    .filter(l => l.date >= startDate && l.date <= endDate)
    .map(l => ({
      date: formatXDate(l.date),
      sleep: l.sleepScore,
      readiness: l.readinessScore,
      totalSleepHrs: l.totalSleep != null ? Math.round(l.totalSleep / 60 * 10) / 10 : null,
    }));

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const sortedWeights = allWeightEntries.sort((a, b) => a.date.localeCompare(b.date));
  const firstWeightLbs = sortedWeights[0]?.weight ?? null;
  const lastWeightLbs = sortedWeights[sortedWeights.length - 1]?.weight ?? null;
  const lastWeight = lastWeightLbs != null ? convertWeight(lastWeightLbs, weightUnit) : null;
  const totalLost = firstWeightLbs && lastWeightLbs
    ? Math.round(convertWeight(firstWeightLbs - lastWeightLbs, weightUnit) * 10) / 10
    : null;

  const totalShots = glp1Logs.filter((l) => l.date >= startDate && l.date <= endDate).length;
  const adherence = dashboardData?.glp1Adherence ?? 0;

  const goalWeight = user?.goalWeight ?? null;
  const goalWeightConverted = goalWeight != null ? convertWeight(goalWeight, weightUnit) : null;
  const WeightTooltip = makeWeightTooltip(weightUnit);

  const allWeightsForDomain = [
    ...weightChartData.map((d) => d.weight),
    ...(goalWeightConverted != null ? [goalWeightConverted] : []),
  ];
  const weightMin = allWeightsForDomain.length > 0 ? Math.floor(Math.min(...allWeightsForDomain) - 2) : 0;
  const weightMax = allWeightsForDomain.length > 0 ? Math.ceil(Math.max(...allWeightsForDomain) + 2) : 300;

  return (
    <div className="px-4 py-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Analytics</h2>
          <p className="text-xs text-muted-foreground">Your GLP-1 journey data</p>
        </div>
        {/* Period toggle */}
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          {([["30", "30d"], ["90", "90d"], ["all", "All"]] as [Period, string][]).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setPeriod(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === v ? "bg-white text-primary shadow-sm" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Adherence + stats row */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <AdherenceRing pct={adherence} />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-bold text-foreground">Shot Adherence</p>
                <p className="text-xs text-muted-foreground">30-day average</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/60 rounded-xl p-2.5 text-center">
                  <div className="text-lg font-bold text-primary">{totalShots}</div>
                  <div className="text-[10px] text-muted-foreground">shots logged</div>
                </div>
                <div className="bg-muted/60 rounded-xl p-2.5 text-center">
                  <div className={`text-lg font-bold ${totalLost && totalLost > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                    {totalLost != null && totalLost > 0 ? `-${totalLost}` : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{weightUnit} lost</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current protocol */}
      {dashboardData?.latestShot && (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center shrink-0">
              <Syringe size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Current Protocol</p>
              <p className="text-xs text-muted-foreground">
                {dashboardData.latestShot.drugName} · {dashboardData.latestShot.doseAmount}{dashboardData.latestShot.doseUnit} · last logged {formatXDate(dashboardData.latestShot.date)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weight trend chart */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown size={16} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Weight Trend</span>
            </div>
            {lastWeight && (
              <Badge variant="secondary" className="text-xs">{lastWeight} {weightUnit}</Badge>
            )}
          </div>

          {weightChartData.length < 2 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={24} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                Log weight with photos or in Progress tab to see your trend
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                {filteredLogs.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <div className="w-3 h-3 rounded-full bg-teal-500 opacity-80" />
                    <span>Injection day</span>
                  </div>
                )}
                {doseChangeLines.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <div className="w-3 border-t border-dashed border-teal-500" />
                    <span>Dose change</span>
                  </div>
                )}
                {goalWeightConverted != null && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <div className="w-3 border-t border-dashed border-amber-500" />
                    <span>Goal ({goalWeightConverted} {weightUnit})</span>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={weightChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3D27CC" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3D27CC" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[weightMin, weightMax]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<WeightTooltip />} />
                  {doseChangeLines.map((dc) => (
                    <ReferenceLine
                      key={`dose-${dc.formattedDate}-${dc.dose}`}
                      x={dc.formattedDate}
                      stroke="#0d9488"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      label={{ value: `${dc.dose}mg`, fontSize: 9, fill: "#0d9488", position: "insideTopLeft" }}
                    />
                  ))}
                  {goalWeightConverted != null && (
                    <ReferenceLine
                      y={goalWeightConverted}
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      label={{ value: "Goal", fontSize: 9, fill: "#f59e0b", position: "insideTopRight" }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="weight"
                    name="Weight"
                    stroke="#3D27CC"
                    strokeWidth={2.5}
                    fill="url(#weightGrad)"
                    dot={<CustomDot />}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dose timeline */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Syringe size={16} className="text-primary" />
            <span className="text-sm font-bold text-foreground">Shot Timeline</span>
          </div>

          {doseData.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={24} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No shots logged in this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={doseData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(val, name, props) => [`${val} ${props.payload?.unit || ""}`, "Dose"]}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="dose" name="Dose" fill="#3D27CC" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Side effect trends */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Symptom Trends</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Scale: 1–5</span>
          </div>

          {sideData.length < 2 ? (
            <div className="h-32 flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={24} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Log 2+ journal entries to see trends</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={sideData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltipSymptom />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Line type="monotone" dataKey="nausea" name="Nausea" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="mood" name="Mood" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="energy" name="Energy" stroke="#3D27CC" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* Legend note */}
          {sideData.length >= 2 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              <span>Nausea/Fatigue: lower is better</span>
              <span>Mood/Energy: higher is better</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Oura Recovery Chart */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon size={16} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Recovery (Oura)</span>
            </div>
            {ouraChartData.length > 0 && (
              <div className="flex gap-3">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span>Sleep</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                  <span>Readiness</span>
                </div>
              </div>
            )}
          </div>

          {ouraChartData.length < 2 ? (
            <div className="h-36 flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={24} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                Connect your Oura Ring in Settings to see sleep & recovery data
              </p>
            </div>
          ) : (
            <>
              {/* Summary stats row */}
              {(() => {
                const validSleep = ouraChartData.filter(d => d.sleep != null);
                const validReady = ouraChartData.filter(d => d.readiness != null);
                const avgSleep = validSleep.length > 0
                  ? Math.round(validSleep.reduce((s, d) => s + (d.sleep ?? 0), 0) / validSleep.length)
                  : null;
                const avgReady = validReady.length > 0
                  ? Math.round(validReady.reduce((s, d) => s + (d.readiness ?? 0), 0) / validReady.length)
                  : null;
                const sleepColor = avgSleep != null ? (avgSleep >= 80 ? "text-green-600" : avgSleep >= 60 ? "text-yellow-600" : "text-red-500") : "text-muted-foreground";
                const readyColor = avgReady != null ? (avgReady >= 80 ? "text-green-600" : avgReady >= 60 ? "text-yellow-600" : "text-red-500") : "text-muted-foreground";
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-2.5 text-center">
                      <p className={`text-lg font-bold ${sleepColor}`}>{avgSleep ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">avg sleep score</p>
                    </div>
                    <div className="bg-teal-50 dark:bg-teal-950/30 rounded-xl p-2.5 text-center">
                      <p className={`text-lg font-bold ${readyColor}`}>{avgReady ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">avg readiness</p>
                    </div>
                  </div>
                );
              })()}
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={ouraChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  />
                  <Line type="monotone" dataKey="sleep" name="Sleep Score" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="readiness" name="Readiness" stroke="#0d9488" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary table */}
      {sideData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 size={16} className="text-primary" />
              <span className="text-sm font-bold text-foreground">Averages This Period</span>
            </div>
            {(() => {
              const avg = (key: keyof typeof sideData[0]) =>
                sideData.length > 0
                  ? Math.round(sideData.reduce((s, d) => s + ((d[key] as number) ?? 0), 0) / sideData.length * 10) / 10
                  : null;
              const items = [
                { label: "Nausea", value: avg("nausea"), emoji: "🤢", low: true },
                { label: "Fatigue", value: avg("fatigue"), emoji: "😴", low: true },
                { label: "Mood", value: avg("mood"), emoji: "😊", low: false },
                { label: "Energy", value: avg("energy"), emoji: "⚡", low: false },
              ];
              return (
                <div className="grid grid-cols-2 gap-2">
                  {items.map(({ label, value, emoji, low }) => {
                    const v = value ?? 0;
                    const good = low ? v <= 2 : v >= 4;
                    const mid = low ? v <= 3 : v >= 3;
                    const color = good ? "text-green-600" : mid ? "text-yellow-600" : "text-red-500";
                    return (
                      <div key={label} className="bg-muted/50 rounded-xl p-3 flex items-center gap-2.5">
                        <span className="text-xl">{emoji}</span>
                        <div>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                          <p className={`text-base font-bold ${color}`}>{value ?? "—"}<span className="text-xs font-normal text-muted-foreground">/5</span></p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
