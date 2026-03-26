import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
  ReferenceLine, ReferenceArea, Area, AreaChart, Legend,
  PieChart, Pie, Cell, ComposedChart,
} from "recharts";
import type { TooltipProps, DotProps } from "recharts";
import {
  TrendingDown, Syringe, Activity, AlertCircle, BarChart2, Moon,
  Share2, Download, Target, Scale, Zap,
} from "lucide-react";
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

// ─── Time range tabs ──────────────────────────────────────────────────────────
type RangeKey = "7" | "14" | "30" | "90" | "180" | "365" | "all";
const RANGE_TABS: { label: string; key: RangeKey; days: number | null }[] = [
  { label: "7d", key: "7", days: 7 },
  { label: "14d", key: "14", days: 14 },
  { label: "1m", key: "30", days: 30 },
  { label: "3m", key: "90", days: 90 },
  { label: "6m", key: "180", days: 180 },
  { label: "1y", key: "365", days: 365 },
  { label: "All", key: "all", days: null },
];

// Dose → color mapping (ascending dose → darker/warmer colors)
const DOSE_COLORS = [
  "#22d3ee", // teal-400 (lowest)
  "#6366f1", // indigo-500
  "#8b5cf6", // violet-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500 (highest)
  "#ec4899", // pink-500
];

function doseColor(dose: number, sortedDoses: number[]): string {
  const idx = sortedDoses.indexOf(dose);
  return DOSE_COLORS[Math.min(idx, DOSE_COLORS.length - 1)];
}

function formatXDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── BMI computation ─────────────────────────────────────────────────────────
function calcBMI(weightLbs: number, heightCm: number): number {
  const heightM = heightCm / 100;
  const weightKg = weightLbs * 0.453592;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

// ─── Custom dot for injection day ────────────────────────────────────────────
const CustomDot = (props: DotProps & { payload?: { injectionDay?: boolean } }) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const isInjection = payload?.injectionDay;
  return (
    <g>
      <circle cx={cx} cy={cy} r={isInjection ? 6 : 3} fill={isInjection ? "#0d9488" : "#3D27CC"} stroke="#fff" strokeWidth={2} />
      {isInjection && <circle cx={cx} cy={cy} r={9} fill="#0d9488" fillOpacity={0.2} />}
    </g>
  );
};

// ─── Adherence ring ───────────────────────────────────────────────────────────
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
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
      />
      <text x={50} y={54} textAnchor="middle" fontSize={18} fontWeight={800} fill={color}>{pct}%</text>
    </svg>
  );
}

function makeWeightTooltip(unit: string) {
  return function WeightTooltip({ active, payload, label }: TooltipProps<number, string>) {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
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
    <div className="bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{String(label)}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}/5</span>
        </p>
      ))}
    </div>
  );
};

// ─── Stat badge card ──────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon, color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl p-3 text-center ${color}`}>
      <div className="mb-1 opacity-80">{icon}</div>
      <div className="text-base font-bold leading-tight">{value}</div>
      {sub && <div className="text-[10px] opacity-70 leading-tight mt-0.5">{sub}</div>}
      <div className="text-[10px] mt-0.5 font-medium opacity-80">{label}</div>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState<RangeKey>("30");
  const [showBMI, setShowBMI] = useState(false);
  const [exporting, setExporting] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  const selectedTab = RANGE_TABS.find((t) => t.key === range)!;
  const days = selectedTab.days ?? 3650;
  const { startDate, endDate } = getDateRange(days);

  const { data: dashboardData } = useQuery<DashboardData>({ queryKey: ["/api/analytics/dashboard"] });
  const { data: user } = useQuery<User>({ queryKey: ["/api/user"] });
  const { data: healthMetrics = [] } = useQuery<HealthMetric[]>({
    queryKey: ["/api/health-metrics/range", { startDate, endDate }],
    queryFn: () => fetch(`/api/health-metrics/range?startDate=${startDate}&endDate=${endDate}`).then((r) => r.json()),
  });
  const { data: glp1Logs = [] } = useQuery<Glp1Log[]>({ queryKey: ["/api/glp1-logs"] });
  const { data: sideEffectLogs = [] } = useQuery<SideEffectLog[]>({ queryKey: ["/api/side-effect-logs"] });
  const { data: progressPhotos = [] } = useQuery<ProgressPhoto[]>({ queryKey: ["/api/progress-photos"] });
  const { data: ouraLogs = [] } = useQuery<OuraDailyLog[]>({
    queryKey: ["/api/oura-daily", { startDate, endDate }],
    queryFn: () => fetch(`/api/oura-daily?startDate=${startDate}&endDate=${endDate}`).then((r) => r.json()),
  });

  const weightUnit = user?.weightUnit ?? "lbs";
  const heightCm = user?.heightCm ?? null;

  // ─── Weight data ──────────────────────────────────────────────────────────
  const allWeightEntries = [
    ...healthMetrics.filter((m) => m.weight != null).map((m) => ({ date: m.date, weight: m.weight! })),
    ...progressPhotos.filter((p) => p.weight != null).map((p) => ({ date: p.date, weight: p.weight! })),
  ]
    .reduce((acc, entry) => {
      if (!acc.find((e) => e.date === entry.date)) acc.push(entry);
      return acc;
    }, [] as { date: string; weight: number }[])
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((e) => e.date >= startDate && e.date <= endDate);

  // ─── Injection logs in range ──────────────────────────────────────────────
  const filteredLogs = glp1Logs
    .filter((l) => l.date >= startDate && l.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));

  const injectionDates = new Set(filteredLogs.map((l) => l.date));

  // ─── Sorted distinct doses for color mapping ──────────────────────────────
  const sortedDoses = Array.from(new Set(filteredLogs.map((l) => l.doseAmount))).sort((a, b) => a - b);

  // ─── Weight chart data — per-segment colored lines ────────────────────────
  // Build segments: consecutive points with same dose get same color
  // Result: array of {date, weight, [doseSegKey]: weight} so recharts can render separate colored lines
  function buildWeightSegments() {
    if (allWeightEntries.length === 0) return { chartData: [], segments: [] as { key: string; color: string; dose: number }[] };

    // For each weight date, find the active dose (last injection on or before that date)
    const allSortedLogs = [...glp1Logs].sort((a, b) => a.date.localeCompare(b.date));
    function doseAtDate(date: string): number | null {
      let last: Glp1Log | null = null;
      for (const l of allSortedLogs) {
        if (l.date <= date) last = l;
        else break;
      }
      return last?.doseAmount ?? null;
    }

    // Build segment keys: "dose_<amount>" or "no_dose"
    const segmentMap = new Map<string, { dose: number | null; color: string }>();

    const chartData = allWeightEntries.map((e) => {
      const dose = doseAtDate(e.date);
      const key = dose != null ? `dose_${dose}` : "no_dose";
      if (!segmentMap.has(key)) {
        const color = dose != null ? doseColor(dose, sortedDoses) : "#94a3b8";
        segmentMap.set(key, { dose, color });
      }
      const point: Record<string, string | number | boolean | null> = {
        date: formatXDate(e.date),
        rawDate: e.date,
        weight: convertWeight(e.weight, weightUnit),
        injectionDay: injectionDates.has(e.date),
      };
      // set this key's value, null for all others (so lines don't connect across segments)
      segmentMap.forEach((_, k) => { point[k] = k === key ? convertWeight(e.weight, weightUnit) : null; });
      if (heightCm) {
        point.bmi = calcBMI(e.weight, heightCm);
      }
      return point;
    });

    const segments = Array.from(segmentMap.entries()).map(([key, { dose, color }]) => ({
      key,
      color,
      dose: dose ?? 0,
    }));

    return { chartData, segments };
  }

  const { chartData: weightChartData, segments: weightSegments } = buildWeightSegments();

  // ─── Dose change reference lines ──────────────────────────────────────────
  const doseChangeLines = filteredLogs.reduce<{ formattedDate: string; dose: number }[]>((acc, log, i) => {
    const prev = filteredLogs[i - 1];
    if (i === 0 || (prev && prev.doseAmount !== log.doseAmount)) {
      acc.push({ formattedDate: formatXDate(log.date), dose: log.doseAmount });
    }
    return acc;
  }, []);

  // ─── Goal weight ──────────────────────────────────────────────────────────
  const goalWeightLbs = user?.goalWeight ?? null;
  const goalWeightConverted = goalWeightLbs != null ? convertWeight(goalWeightLbs, weightUnit) : null;

  // ─── Stats row ────────────────────────────────────────────────────────────
  const sortedWeights = [...allWeightEntries].sort((a, b) => a.date.localeCompare(b.date));
  const firstWeightLbs = sortedWeights[0]?.weight ?? null;
  const lastWeightLbs = sortedWeights[sortedWeights.length - 1]?.weight ?? null;
  const totalChange = firstWeightLbs && lastWeightLbs
    ? Math.round(convertWeight(firstWeightLbs - lastWeightLbs, weightUnit) * 10) / 10
    : null;

  const currentBMI = lastWeightLbs && heightCm ? calcBMI(lastWeightLbs, heightCm) : null;

  // Weekly avg rate (lbs/week) from all weight entries
  const weeklyRate = (() => {
    if (sortedWeights.length < 2) return null;
    const first = sortedWeights[0];
    const last = sortedWeights[sortedWeights.length - 1];
    const weeks = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (7 * 24 * 60 * 60 * 1000);
    if (weeks < 0.1) return null;
    return Math.round(convertWeight((first.weight - last.weight) / weeks, weightUnit) * 100) / 100;
  })();

  const pctToGoal = (() => {
    if (!firstWeightLbs || !lastWeightLbs || !goalWeightLbs) return null;
    const totalNeeded = firstWeightLbs - goalWeightLbs;
    if (totalNeeded <= 0) return null;
    const achieved = firstWeightLbs - lastWeightLbs;
    return Math.min(Math.round((achieved / totalNeeded) * 100), 100);
  })();

  const totalShots = filteredLogs.length;
  const adherence = dashboardData?.glp1Adherence ?? 0;
  const WeightTooltip = makeWeightTooltip(weightUnit);

  const allWeightsForDomain = [
    ...weightChartData.map((d) => d.weight as number),
    ...(goalWeightConverted != null ? [goalWeightConverted] : []),
  ];
  const weightMin = allWeightsForDomain.length > 0 ? Math.floor(Math.min(...allWeightsForDomain) - 2) : 0;
  const weightMax = allWeightsForDomain.length > 0 ? Math.ceil(Math.max(...allWeightsForDomain) + 2) : 300;

  // ─── Injection site distribution ─────────────────────────────────────────
  const siteCounts = filteredLogs.reduce<Record<string, number>>((acc, l) => {
    const site = l.injectionSite || "Unspecified";
    acc[site] = (acc[site] ?? 0) + 1;
    return acc;
  }, {});
  const siteData = Object.entries(siteCounts).map(([name, value]) => ({ name, value }));
  const SITE_COLORS = ["#6366f1", "#0d9488", "#f59e0b", "#ef4444", "#8b5cf6", "#22d3ee"];

  // ─── Side effect frequency (count of entries where symptom was logged) ───────
  const filteredSide = sideEffectLogs.filter((l) => l.date >= startDate && l.date <= endDate);
  const sideData = filteredSide.map((l) => ({
    date: formatXDate(l.date), nausea: l.nausea, fatigue: l.fatigue, mood: l.mood, energy: l.energy,
  }));

  const sideFreqData = (() => {
    if (filteredSide.length === 0) return [];
    const total = filteredSide.length;
    const keys: (keyof SideEffectLog)[] = ["nausea", "fatigue", "mood", "energy"];
    return keys.map((k) => {
      const logged = filteredSide.filter((l) => l[k] != null && (l[k] as number) > 0).length;
      return {
        name: k.charAt(0).toUpperCase() + k.slice(1),
        count: logged,
        pct: Math.round((logged / total) * 100),
      };
    });
  })();

  // ─── Oura chart ───────────────────────────────────────────────────────────
  const ouraChartData = ouraLogs
    .filter((l) => l.date >= startDate && l.date <= endDate)
    .map((l) => ({
      date: formatXDate(l.date),
      rawDate: l.date,
      sleep: l.sleepScore,
      readiness: l.readinessScore,
      hrv: l.hrv != null ? Math.round(l.hrv) : null,
      injectionDay: injectionDates.has(l.date),
    }));
  const ouraInjectionLines = ouraChartData.filter((d) => d.injectionDay).map((d) => d.date);

  // ─── Share / Export ───────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!shareRef.current) return;
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(shareRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL("image/png");
      // Try Web Share API first (mobile), fall back to download
      if (navigator.share && navigator.canShare?.({ files: [] })) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const file = new File([blob], "leveltrack-progress.png", { type: "image/png" });
        await navigator.share({ title: "My LevelTrack Progress", files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "leveltrack-progress.png";
        a.click();
      }
    } finally {
      setExporting(false);
    }
  }, []);

  const bmiLabel = currentBMI != null
    ? currentBMI < 18.5 ? "Underweight" : currentBMI < 25 ? "Normal" : currentBMI < 30 ? "Overweight" : "Obese"
    : null;

  return (
    <div className="px-4 py-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Analytics</h2>
          <p className="text-xs text-muted-foreground">Your GLP-1 journey data</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-1.5 text-xs h-8"
        >
          <Share2 size={13} />
          {exporting ? "Exporting…" : "Share"}
        </Button>
      </div>

      {/* Time range tabs */}
      <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
        {RANGE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setRange(t.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 ${
              range === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Shareable stats + chart section ── */}
      <div ref={shareRef} className="space-y-4">

        {/* Stats header row */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard
            label="Total Change"
            value={totalChange != null
              ? totalChange > 0
                ? `-${totalChange} ${weightUnit}`
                : totalChange < 0
                  ? `+${Math.abs(totalChange)} ${weightUnit}`
                  : `0 ${weightUnit}`
              : "—"
            }
            sub={totalChange != null ? (totalChange > 0 ? "lost" : totalChange < 0 ? "gained" : "no change") : undefined}
            icon={<TrendingDown size={14} />}
            color="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
          />
          <StatCard
            label="Current BMI"
            value={currentBMI ?? "—"}
            sub={bmiLabel ?? (heightCm ? undefined : "Set height →")}
            icon={<Scale size={14} />}
            color="bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300"
          />
          <StatCard
            label="Avg Rate/wk"
            value={weeklyRate != null ? `${weeklyRate > 0 ? "↓" : "↑"}${Math.abs(weeklyRate)}` : "—"}
            sub={weeklyRate != null ? `${weightUnit}/wk` : undefined}
            icon={<Zap size={14} />}
            color="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"
          />
          <StatCard
            label="% To Goal"
            value={pctToGoal != null ? `${pctToGoal}%` : "—"}
            sub={pctToGoal != null ? (pctToGoal >= 100 ? "Reached! 🎉" : "of goal") : (goalWeightLbs ? undefined : "Set goal →")}
            icon={<Target size={14} />}
            color="bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300"
          />
        </div>

        {/* Adherence card */}
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
                    <div className="text-[10px] text-muted-foreground">shots this period</div>
                  </div>
                  <div className="bg-muted/60 rounded-xl p-2.5 text-center">
                    <div className={`text-lg font-bold ${totalChange && totalChange > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                      {totalChange != null && totalChange > 0 ? `-${totalChange}` : totalChange != null && totalChange < 0 ? `+${Math.abs(totalChange)}` : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{weightUnit} {totalChange != null && totalChange < 0 ? "gained" : "lost"}</div>
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
              <div className="flex items-center gap-2">
                {weightChartData.length >= 2 && lastWeightLbs && heightCm && (
                  <button
                    onClick={() => setShowBMI((v) => !v)}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                      showBMI
                        ? "bg-teal-500 text-white border-teal-500"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    BMI
                  </button>
                )}
                {lastWeightLbs && (
                  <Badge variant="secondary" className="text-xs">
                    {convertWeight(lastWeightLbs, weightUnit)} {weightUnit}
                  </Badge>
                )}
              </div>
            </div>

            {/* Dose color legend */}
            {weightSegments.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {weightSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: seg.color }} />
                    <span>{seg.dose > 0 ? `${seg.dose}mg` : "No dose"}</span>
                  </div>
                ))}
                {goalWeightConverted != null && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <div className="w-3 border-t border-dashed border-amber-500" />
                    <span>Goal ({goalWeightConverted} {weightUnit})</span>
                  </div>
                )}
              </div>
            )}

            {weightChartData.length < 2 ? (
              <div className="h-40 flex flex-col items-center justify-center text-center gap-2">
                <AlertCircle size={24} className="text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Log weight with photos or in Progress tab to see your trend</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={weightChartData} margin={{ top: 5, right: showBMI ? 25 : 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3D27CC" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3D27CC" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="w" domain={[weightMin, weightMax]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  {showBMI && (
                    <YAxis yAxisId="bmi" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  )}
                  <Tooltip content={<WeightTooltip />} />
                  {doseChangeLines.map((dc) => (
                    <ReferenceLine
                      key={`dose-${dc.formattedDate}-${dc.dose}`}
                      x={dc.formattedDate} yAxisId="w"
                      stroke="#0d9488" strokeWidth={1.5} strokeDasharray="4 3"
                      label={{ value: `${dc.dose}mg`, fontSize: 9, fill: "#0d9488", position: "insideTopLeft" }}
                    />
                  ))}
                  {goalWeightConverted != null && lastWeightLbs != null && (() => {
                    const currentW = convertWeight(lastWeightLbs, weightUnit);
                    const lo = Math.min(currentW, goalWeightConverted);
                    const hi = Math.max(currentW, goalWeightConverted);
                    return (
                      <ReferenceArea
                        yAxisId="w" y1={lo} y2={hi}
                        fill="#f59e0b" fillOpacity={0.08}
                        stroke="none"
                      />
                    );
                  })()}
                  {goalWeightConverted != null && (
                    <ReferenceLine
                      y={goalWeightConverted} yAxisId="w"
                      stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 4"
                      label={{ value: `Goal ${goalWeightConverted}${weightUnit}`, fontSize: 9, fill: "#f59e0b", position: "insideTopRight" }}
                    />
                  )}
                  {/* Shaded area under weight */}
                  <Area
                    yAxisId="w" type="monotone" dataKey="weight"
                    stroke="none" fill="url(#weightGrad)" dot={false}
                  />
                  {/* One colored line per dose segment */}
                  {weightSegments.map((seg) => (
                    <Line
                      key={seg.key} yAxisId="w"
                      type="monotone" dataKey={seg.key}
                      name={seg.dose > 0 ? `${seg.dose}mg` : "Weight"}
                      stroke={seg.color} strokeWidth={2.5}
                      dot={<CustomDot />} connectNulls={false}
                    />
                  ))}
                  {showBMI && heightCm && (
                    <Line
                      yAxisId="bmi" type="monotone" dataKey="bmi"
                      name="BMI" stroke="#0d9488" strokeWidth={2}
                      dot={false} strokeDasharray="4 3"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* LevelTrack branding — included in share capture */}
        <div className="text-center text-[10px] text-muted-foreground py-1">
          Tracked with <span className="font-bold text-primary">LevelTrack</span>
        </div>

      </div>{/* end shareRef */}

      {/* Shot Timeline */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Syringe size={16} className="text-primary" />
            <span className="text-sm font-bold text-foreground">Shot Timeline</span>
          </div>
          {filteredLogs.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={24} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No shots logged in this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart
                data={filteredLogs.map((l) => ({
                  date: formatXDate(l.date),
                  dose: l.doseAmount,
                  unit: l.doseUnit,
                  fill: doseColor(l.doseAmount, sortedDoses),
                }))}
                margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(val, _name, props) => [`${val} ${props.payload?.unit || "mg"}`, "Dose"]}
                  labelStyle={{ fontSize: 11, fontWeight: 600 }}
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb" }}
                />
                <Bar dataKey="dose" name="Dose" radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {filteredLogs.map((l, i) => (
                    <Cell key={`cell-${i}`} fill={doseColor(l.doseAmount, sortedDoses)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Two-column: Injection Site Distribution + Side Effect Frequency */}
      <div className="grid grid-cols-2 gap-3">

        {/* Injection site donut */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Syringe size={13} className="text-primary" />
              <span className="text-xs font-bold text-foreground">Injection Sites</span>
            </div>
            {siteData.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center text-center gap-1">
                <AlertCircle size={18} className="text-muted-foreground/30" />
                <p className="text-[10px] text-muted-foreground">No site data</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={100}>
                  <PieChart>
                    <Pie
                      data={siteData} cx="50%" cy="50%"
                      innerRadius={28} outerRadius={44}
                      dataKey="value" nameKey="name"
                      strokeWidth={0}
                    >
                      {siteData.map((_entry, i) => (
                        <Cell key={`site-${i}`} fill={SITE_COLORS[i % SITE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb" }}
                      formatter={(val, name) => [val, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-0.5">
                  {siteData.slice(0, 4).map((s, i) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SITE_COLORS[i % SITE_COLORS.length] }} />
                      <span className="truncate">{s.name}</span>
                      <span className="ml-auto font-semibold text-foreground">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Side effect frequency */}
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Activity size={13} className="text-primary" />
              <span className="text-xs font-bold text-foreground">Symptom Frequency</span>
            </div>
            {sideFreqData.length === 0 ? (
              <div className="h-28 flex flex-col items-center justify-center text-center gap-1">
                <AlertCircle size={18} className="text-muted-foreground/30" />
                <p className="text-[10px] text-muted-foreground">No journal data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart
                  data={sideFreqData}
                  layout="vertical"
                  margin={{ top: 2, right: 24, left: 0, bottom: 2 }}
                >
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    formatter={(val, _name, props) => [`${props.payload?.count} logs (${val}%)`, "Frequency"]}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {sideFreqData.map((_entry, i) => {
                      const colors = ["#ef4444", "#f97316", "#22c55e", "#3D27CC"];
                      return <Cell key={`freq-${i}`} fill={colors[i % colors.length]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Symptom Trends (line chart) */}
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
              <div className="flex gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /><span>Sleep</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full bg-teal-500" /><span>Readiness</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" /><span>HRV</span>
                </div>
              </div>
            )}
          </div>

          {ouraChartData.length < 2 ? (
            <div className="h-36 flex flex-col items-center justify-center text-center gap-2">
              <AlertCircle size={24} className="text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Connect your Oura Ring in Settings to see sleep & recovery data</p>
            </div>
          ) : (
            <>
              {(() => {
                const validSleep = ouraChartData.filter((d) => d.sleep != null);
                const validReady = ouraChartData.filter((d) => d.readiness != null);
                const validHrv = ouraChartData.filter((d) => d.hrv != null);
                const avgSleep = validSleep.length > 0 ? Math.round(validSleep.reduce((s, d) => s + (d.sleep ?? 0), 0) / validSleep.length) : null;
                const avgReady = validReady.length > 0 ? Math.round(validReady.reduce((s, d) => s + (d.readiness ?? 0), 0) / validReady.length) : null;
                const avgHrv = validHrv.length > 0 ? Math.round(validHrv.reduce((s, d) => s + (d.hrv ?? 0), 0) / validHrv.length) : null;
                const sleepColor = avgSleep != null ? (avgSleep >= 80 ? "text-green-600" : avgSleep >= 60 ? "text-yellow-600" : "text-red-500") : "text-muted-foreground";
                const readyColor = avgReady != null ? (avgReady >= 80 ? "text-green-600" : avgReady >= 60 ? "text-yellow-600" : "text-red-500") : "text-muted-foreground";
                return (
                  <div className={avgHrv != null ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-xl p-2.5 text-center">
                      <p className={`text-lg font-bold ${sleepColor}`}>{avgSleep ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">avg sleep</p>
                    </div>
                    <div className="bg-teal-50 dark:bg-teal-950/30 rounded-xl p-2.5 text-center">
                      <p className={`text-lg font-bold ${readyColor}`}>{avgReady ?? "—"}</p>
                      <p className="text-[10px] text-muted-foreground">readiness</p>
                    </div>
                    {avgHrv != null && (
                      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2.5 text-center">
                        <p className="text-lg font-bold text-amber-600">{avgHrv}<span className="text-xs font-normal">ms</span></p>
                        <p className="text-[10px] text-muted-foreground">avg HRV</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={ouraChartData} margin={{ top: 5, right: 30, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="score" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="hrv" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #e5e7eb" }}
                    labelStyle={{ fontSize: 11, fontWeight: 600 }}
                    formatter={(val, name) => [name === "HRV" ? `${val} ms` : `${val}/100`, name]}
                  />
                  {ouraInjectionLines.map((date) => (
                    <ReferenceLine key={`oura-inj-${date}`} x={date} yAxisId="score" stroke="#0d9488" strokeWidth={1.5} strokeDasharray="4 3" />
                  ))}
                  <Line yAxisId="score" type="monotone" dataKey="sleep" name="Sleep" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="score" type="monotone" dataKey="readiness" name="Readiness" stroke="#0d9488" strokeWidth={2} dot={false} connectNulls />
                  <Line yAxisId="hrv" type="monotone" dataKey="hrv" name="HRV" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
              {ouraInjectionLines.length > 0 && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="w-3 border-t border-dashed border-teal-500" />
                  <span>Injection day</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Averages summary table */}
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
