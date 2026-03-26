import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Plus, Trash2, Save, FlaskConical, BookOpen, Syringe, Undo2,
  ChevronDown, ChevronUp, AlertTriangle, Flame, Info,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usePeptideRef } from "@/pages/peptide-reference";

// ─── Types ───────────────────────────────────────────────────────────────────

type DoseUnit = "mcg" | "mg" | "g";

interface PeptideEntry {
  name: string;
  amountMg: number;
  desiredDose: number;
  doseUnit: DoseUnit;
}

interface CalcResult {
  pepName: string;
  unitsPerDose: number;
  mlPerDose: number;
  mcgPerUnit: number;
  concentrationMgMl: number;
}

interface SavedCalc {
  id: number;
  name: string;
  peptides: Array<{ name: string; amountMg: number; desiredDoseMcg: number }>;
  bacWaterMl: number;
  syringeType: "U-100" | "U-40";
  injectionSchedule: string | null;
  notes: string | null;
  logCount: number;
  lastLoggedAt: string | null;
  streak: number;
  createdAt: string;
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

function toMcg(value: number, unit: DoseUnit): number {
  if (unit === "mcg") return value;
  if (unit === "mg") return value * 1000;
  return value * 1_000_000;
}

function calcDoses(
  peptides: PeptideEntry[],
  bacWaterMl: number,
  syringeType: "U-100" | "U-40",
): CalcResult[] {
  const unitsPerMl = syringeType === "U-100" ? 100 : 40;
  return peptides.map(p => {
    const desiredMcg = toMcg(p.desiredDose, p.doseUnit);
    const mcgPerMl = bacWaterMl > 0 ? (p.amountMg * 1000) / bacWaterMl : 0;
    const concentrationMgMl = bacWaterMl > 0 ? p.amountMg / bacWaterMl : 0;
    const mcgPerUnit = mcgPerMl / unitsPerMl;
    const unitsPerDose = mcgPerUnit > 0 ? desiredMcg / mcgPerUnit : 0;
    const mlPerDose = unitsPerMl > 0 ? unitsPerDose / unitsPerMl : 0;
    return {
      pepName: p.name,
      unitsPerDose: Math.round(unitsPerDose * 10) / 10,
      mlPerDose: Math.round(mlPerDose * 1000) / 1000,
      mcgPerUnit: Math.round(mcgPerUnit * 100) / 100,
      concentrationMgMl: Math.round(concentrationMgMl * 1000) / 1000,
    };
  });
}

function estimateTotalDoses(peptides: Array<{ amountMg: number; desiredDoseMcg: number }>): number {
  if (!peptides.length) return 30;
  const doses = peptides.map(p =>
    p.desiredDoseMcg > 0 ? Math.floor((p.amountMg * 1000) / p.desiredDoseMcg) : 30
  );
  return Math.min(...doses);
}

// ─── SVG Syringe Ruler ────────────────────────────────────────────────────────

function SyringeRuler({
  unitsPerDose,
  mlPerDose,
  syringeType,
}: {
  unitsPerDose: number;
  mlPerDose: number;
  syringeType: "U-100" | "U-40";
}) {
  const maxUnits = syringeType === "U-100" ? 100 : 40;
  const tickStep = syringeType === "U-100" ? 10 : 5;
  const ticks = Array.from({ length: Math.floor(maxUnits / tickStep) + 1 }, (_, i) => i * tickStep);

  const fillPct = Math.min(unitsPerDose / maxUnits, 1);
  const svgW = 260;
  const barH = 22;
  const barY = 24;
  const barX = 28;
  const barW = svgW - barX - 10;
  const fillW = fillPct * barW;
  const tipW = 14;
  const totalH = barY + barH + 28;

  return (
    <div className="flex flex-col items-center my-1">
      <svg width={svgW} height={totalH} viewBox={`0 0 ${svgW} ${totalH}`} className="overflow-visible">
        {/* syringe barrel */}
        <rect x={barX} y={barY} width={barW} height={barH} rx={barH / 2} ry={barH / 2}
          className="fill-muted stroke-border" strokeWidth="1.5" />
        {/* fill */}
        {fillW > 0 && (
          <rect x={barX} y={barY} width={Math.max(fillW, barH / 2)} height={barH}
            rx={barH / 2} ry={barH / 2} className="fill-primary/70" />
        )}
        {/* tip */}
        <polygon
          points={`${barX - 1},${barY + 5} ${barX - tipW},${barY + barH / 2} ${barX - 1},${barY + barH - 5}`}
          className="fill-muted stroke-border" strokeWidth="1.5"
        />
        {/* plunger */}
        <rect x={barX + barW - 2} y={barY - 4} width={6} height={barH + 8} rx={2}
          className="fill-border" />
        {/* ticks */}
        {ticks.map(tick => {
          const x = barX + (tick / maxUnits) * barW;
          const isMajor = tick % (tickStep * 2) === 0;
          return (
            <g key={tick}>
              <line x1={x} y1={barY - (isMajor ? 7 : 4)} x2={x} y2={barY}
                className="stroke-muted-foreground" strokeWidth={isMajor ? 1.5 : 1} />
              {isMajor && (
                <text x={x} y={barY - 9} textAnchor="middle"
                  className="fill-muted-foreground" fontSize="8" fontFamily="monospace">
                  {tick}
                </text>
              )}
            </g>
          );
        })}
        {/* draw indicator */}
        {unitsPerDose > 0 && (() => {
          const ix = Math.min(Math.max(barX + fillW, barX + 16), barX + barW - 16);
          return (
            <g>
              <line x1={barX + fillW} y1={barY + barH + 2} x2={barX + fillW} y2={barY + barH + 12}
                className="stroke-amber-500" strokeWidth="2" strokeDasharray="3,2" />
              <text x={ix} y={barY + barH + 24} textAnchor="middle"
                className="fill-amber-600 dark:fill-amber-400" fontSize="9" fontWeight="700"
                fontFamily="monospace">
                {unitsPerDose}u / {mlPerDose} mL
              </text>
            </g>
          );
        })()}
      </svg>
      <p className="text-[10px] text-muted-foreground -mt-1">
        {syringeType} · draw <span className="font-semibold">{unitsPerDose} units</span> ({mlPerDose} mL)
      </p>
    </div>
  );
}

// ─── Reconstitution Calculator (inverse solver) ───────────────────────────────

function ReconCalc({
  defaultPeptideMg,
  defaultBacMl,
}: {
  defaultPeptideMg: number;
  defaultBacMl: number;
}) {
  type Mode = "find-bac" | "find-conc";
  const [mode, setMode] = useState<Mode>("find-bac");
  const [peptideMg, setPeptideMg] = useState(defaultPeptideMg || 5);
  const [bacMl, setBacMl] = useState(defaultBacMl || 2);
  const [targetConcMgMl, setTargetConcMgMl] = useState(2.5);

  const computedBac = mode === "find-bac" && peptideMg > 0 && targetConcMgMl > 0
    ? Math.round((peptideMg / targetConcMgMl) * 100) / 100
    : null;
  const computedConc = mode === "find-conc" && peptideMg > 0 && bacMl > 0
    ? Math.round((peptideMg / bacMl) * 100) / 100
    : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        <button
          className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${mode === "find-bac" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setMode("find-bac")}
        >
          Find BAC water
        </button>
        <button
          className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-all ${mode === "find-conc" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          onClick={() => setMode("find-conc")}
        >
          Find concentration
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] text-muted-foreground">Peptide vial (mg)</Label>
          <Input type="number" min="0.1" step="0.5" value={peptideMg}
            onChange={e => setPeptideMg(parseFloat(e.target.value) || 0)}
            className="h-9 text-sm" />
        </div>
        {mode === "find-bac" ? (
          <div>
            <Label className="text-[10px] text-muted-foreground">Target concentration (mg/mL)</Label>
            <Input type="number" min="0.1" step="0.5" value={targetConcMgMl}
              onChange={e => setTargetConcMgMl(parseFloat(e.target.value) || 0)}
              className="h-9 text-sm" />
          </div>
        ) : (
          <div>
            <Label className="text-[10px] text-muted-foreground">BAC water (mL)</Label>
            <Input type="number" min="0.1" step="0.5" value={bacMl}
              onChange={e => setBacMl(parseFloat(e.target.value) || 0)}
              className="h-9 text-sm" />
          </div>
        )}
      </div>

      {mode === "find-bac" && computedBac !== null && (
        <div className="bg-primary/10 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Add this much BAC water to achieve {targetConcMgMl} mg/mL:</p>
          <p className="text-2xl font-bold text-primary mt-1">{computedBac} <span className="text-sm font-medium">mL</span></p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{peptideMg} mg ÷ {targetConcMgMl} mg/mL</p>
        </div>
      )}
      {mode === "find-conc" && computedConc !== null && (
        <div className="bg-primary/10 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground">Resulting concentration with {bacMl} mL BAC water:</p>
          <p className="text-2xl font-bold text-primary mt-1">{computedConc} <span className="text-sm font-medium">mg/mL</span></p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{peptideMg} mg ÷ {bacMl} mL</p>
        </div>
      )}
    </div>
  );
}

// ─── Reconstitution Guide ─────────────────────────────────────────────────────

function ReconstitutionGuide({
  bacWaterMl,
  peptides,
}: {
  bacWaterMl: number;
  peptides: PeptideEntry[];
}) {
  const validPeptides = peptides.filter(p => p.name && p.amountMg > 0);
  const steps = [
    {
      n: 1, title: "Gather supplies",
      body: "Bacteriostatic water (BAC water), insulin syringe, peptide vial(s), alcohol swabs, and a clean surface.",
    },
    {
      n: 2, title: "Clean vial tops",
      body: "Wipe the rubber stopper of each vial and the BAC water bottle with an alcohol swab. Allow to air dry 30 seconds.",
    },
    {
      n: 3, title: "Draw BAC water",
      body: `Draw ${bacWaterMl > 0 ? bacWaterMl : "—"} mL of BAC water into the syringe slowly to avoid foaming.`,
    },
    {
      n: 4, title: "Inject into peptide vial",
      body: "Insert needle at a slight angle and let BAC water run down the side of the glass — do NOT spray directly onto the powder.",
    },
    {
      n: 5, title: "Swirl gently",
      body: "Roll the vial between your palms until fully dissolved. Do not shake — this degrades the peptide.",
    },
    {
      n: 6, title: "Inspect",
      body: "The solution should be clear with no particles. Discard if cloudy or discolored.",
    },
    {
      n: 7, title: "Store correctly",
      body: "Refrigerate at 2–8 °C (36–46 °F). Most peptides are stable 4–6 weeks reconstituted. Label with date.",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Current blend context */}
      {validPeptides.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-primary mb-1">Current blend</p>
            {validPeptides.map((p, i) => (
              <p key={i} className="text-xs text-foreground">
                <span className="font-medium">{p.name}</span>
                {" — "}{p.amountMg} mg vial + {bacWaterMl > 0 ? bacWaterMl : "—"} mL BAC water
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Reconstitution inverse calc */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold flex items-center gap-1.5">
            <FlaskConical size={13} className="text-primary" />
            Reconstitution Calculator
          </Label>
          <ReconCalc
            defaultPeptideMg={validPeptides[0]?.amountMg ?? 5}
            defaultBacMl={bacWaterMl}
          />
        </CardContent>
      </Card>

      {/* Steps */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm font-semibold">Step-by-step guide</Label>
          <div className="space-y-3">
            {steps.map(s => (
              <div key={s.n} className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                  <span className="text-[10px] font-bold text-primary">{s.n}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-400/30 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="p-3 flex gap-2">
          <Info size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Always verify dosing and protocols with a licensed prescriber. This tool is for reference only.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Vial Card ────────────────────────────────────────────────────────────────

function VialCard({
  calc,
  onLogDose,
  onUndo,
  onDelete,
  onLearnMore,
  isLogging,
  isUndoing,
}: {
  calc: SavedCalc;
  onLogDose: (id: number) => void;
  onUndo: (id: number) => void;
  onDelete: (id: number) => void;
  onLearnMore: (name: string) => void;
  isLogging: boolean;
  isUndoing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const results = useMemo(
    () => calcDoses(
      calc.peptides.map(p => ({
        name: p.name,
        amountMg: p.amountMg,
        desiredDose: p.desiredDoseMcg,
        doseUnit: "mcg" as DoseUnit,
      })),
      calc.bacWaterMl,
      calc.syringeType,
    ),
    [calc],
  );

  const totalDoses = estimateTotalDoses(calc.peptides);
  const usedDoses = calc.logCount ?? 0;
  const remaining = Math.max(0, totalDoses - usedDoses);
  const remainPct = totalDoses > 0 ? Math.round((remaining / totalDoses) * 100) : 0;
  const isLow = remaining < 3 && totalDoses > 0;

  const streak = calc.streak ?? 0;

  const totalMlPerDose = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.mlPerDose, 0) * 1000) / 1000
    : 0;

  const primaryResult = results[0];

  return (
    <Card className={isLow ? "border-amber-400/50" : undefined}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-foreground truncate">{calc.name}</p>
              {isLow && (
                <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40 font-semibold shrink-0">
                  <AlertTriangle size={9} className="mr-0.5" /> Reorder soon
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {calc.peptides.map(p => `${p.name} ${p.amountMg}mg`).join(" + ")} · {calc.bacWaterMl} mL BAC · {calc.syringeType}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {streak > 0 && (
              <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0 border-orange-400/50 text-orange-600 dark:text-orange-400">
                <Flame size={9} className="fill-orange-500 stroke-none" /> {streak}d
              </Badge>
            )}
            <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground p-1">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground font-medium">Vial usage</span>
            <span className={`text-[10px] font-semibold ${isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {remaining} of {totalDoses} doses left
            </span>
          </div>
          <Progress
            value={remainPct}
            className={`h-1.5 ${isLow ? "[&>div]:bg-amber-500" : "[&>div]:bg-primary"}`}
          />
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Syringe ruler for primary peptide */}
            {primaryResult && primaryResult.unitsPerDose > 0 && (
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-[10px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">
                  {primaryResult.pepName} — draw amount
                </p>
                <SyringeRuler
                  unitsPerDose={primaryResult.unitsPerDose}
                  mlPerDose={primaryResult.mlPerDose}
                  syringeType={calc.syringeType}
                />
              </div>
            )}

            {/* Dosage table */}
            <div className="rounded-xl overflow-hidden border text-xs">
              <div className="grid grid-cols-4 bg-muted/60 px-3 py-1.5 font-semibold text-muted-foreground">
                <span>Peptide</span>
                <span className="text-center">Units</span>
                <span className="text-center">Draw</span>
                <span className="text-right">Conc.</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-4 px-3 py-1.5 border-t">
                  <span className="font-medium truncate">{r.pepName}</span>
                  <span className="text-center font-mono text-primary font-bold">{r.unitsPerDose}u</span>
                  <span className="text-center font-mono text-foreground">{r.mlPerDose} mL</span>
                  <span className="text-right text-muted-foreground">{r.concentrationMgMl} mg/mL</span>
                </div>
              ))}
              {results.length > 1 && (
                <div className="grid grid-cols-4 px-3 py-1.5 border-t bg-primary/5">
                  <span className="font-semibold text-foreground col-span-2">Total draw</span>
                  <span className="text-center col-span-2 font-mono text-primary font-bold">
                    {totalMlPerDose} mL
                  </span>
                </div>
              )}
            </div>

            {calc.injectionSchedule && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Schedule:</span> {calc.injectionSchedule}
              </p>
            )}
            {calc.notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">{calc.notes}</p>
            )}
            {calc.lastLoggedAt && (
              <p className="text-[10px] text-muted-foreground">
                Last dose: {new Date(calc.lastLoggedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="flex-1 gradient-primary text-white h-9 text-xs font-semibold"
            onClick={() => onLogDose(calc.id)}
            disabled={isLogging}
          >
            <Syringe size={12} className="mr-1" />
            {isLogging ? "Logging…" : "Log Dose"}
          </Button>
          {calc.peptides.length > 0 && (
            <Button
              size="sm" variant="outline" className="h-9 px-2.5 text-xs gap-1"
              onClick={() => onLearnMore(calc.peptides[0].name)}
              title="Learn more about this peptide"
            >
              <BookOpen size={12} /> Learn More
            </Button>
          )}
          <Button
            size="sm" variant="outline" className="h-9 px-3"
            onClick={() => onUndo(calc.id)}
            disabled={isUndoing || usedDoses === 0}
            title="Undo last dose"
          >
            <Undo2 size={12} />
          </Button>
          <Button
            size="sm" variant="ghost" className="h-9 px-3 text-red-400 hover:text-red-600"
            onClick={() => onDelete(calc.id)}
            title="Delete"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PeptideCalculator() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { openByName: openPeptideRef, sheet: peptideRefSheet } = usePeptideRef();

  const [peptides, setPeptides] = useState<PeptideEntry[]>([
    { name: "", amountMg: 5, desiredDose: 250, doseUnit: "mcg" },
  ]);
  const [bacWaterMl, setBacWaterMl] = useState(2);
  const [syringeType, setSyringeType] = useState<"U-100" | "U-40">("U-100");
  const [calcName, setCalcName] = useState("");
  const [schedule, setSchedule] = useState("");
  const [notes, setNotes] = useState("");
  const [loggingId, setLoggingId] = useState<number | null>(null);
  const [undoingId, setUndoingId] = useState<number | null>(null);

  const { data: savedCalcs = [], isLoading } = useQuery<SavedCalc[]>({
    queryKey: ['/api/peptide-calcs'],
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: calcName || `Blend ${new Date().toLocaleDateString()}`,
        peptides: peptides.map(p => ({
          name: p.name,
          amountMg: p.amountMg,
          desiredDoseMcg: toMcg(p.desiredDose, p.doseUnit),
        })),
        bacWaterMl,
        syringeType,
        injectionSchedule: schedule || undefined,
        notes: notes || undefined,
      };
      const response = await apiRequest("POST", "/api/peptide-calcs", payload);
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Saved!", description: "Calculation saved to My Calcs." });
      setCalcName(""); setSchedule(""); setNotes("");
    },
    onError: () => toast({ title: "Error", description: "Failed to save calculation", variant: "destructive" }),
  });

  const logDoseMutation = useMutation({
    mutationFn: async (id: number) => {
      setLoggingId(id);
      const response = await apiRequest("POST", `/api/peptide-calcs/${id}/logs`, {});
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Dose logged!", description: "Added to vial tracker." });
    },
    onError: () => toast({ title: "Error", description: "Failed to log dose", variant: "destructive" }),
    onSettled: () => setLoggingId(null),
  });

  const undoMutation = useMutation({
    mutationFn: async (id: number) => {
      setUndoingId(id);
      const response = await apiRequest("DELETE", `/api/peptide-calcs/${id}/logs/last`, {});
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Undone", description: "Last dose removed." });
    },
    onError: () => toast({ title: "Error", description: "Failed to undo dose", variant: "destructive" }),
    onSettled: () => setUndoingId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/peptide-calcs/${id}`, {});
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  });

  const addPeptide = () => setPeptides(p => [...p, { name: "", amountMg: 5, desiredDose: 250, doseUnit: "mcg" }]);
  const removePeptide = (i: number) => setPeptides(p => p.filter((_, idx) => idx !== i));
  const updatePeptide = (i: number, key: keyof PeptideEntry, val: string | number) => {
    setPeptides(p => p.map((pep, idx) => idx === i ? { ...pep, [key]: val } : pep));
  };

  const validPeptides = peptides.filter(p => p.name && p.amountMg > 0 && p.desiredDose > 0);
  const results = validPeptides.length > 0 && bacWaterMl > 0
    ? calcDoses(validPeptides, bacWaterMl, syringeType)
    : [];

  const primaryResult = results[0];
  const totalMlPerDose = results.length > 0
    ? Math.round(results.reduce((s, r) => s + r.mlPerDose, 0) * 1000) / 1000
    : 0;

  const lowStockCount = savedCalcs.filter(c => {
    const total = estimateTotalDoses(c.peptides);
    return total > 0 && (total - (c.logCount ?? 0)) < 3;
  }).length;

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Peptide Calculator</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Reconstitution, dosage & vial tracker</p>
        </div>
        {lowStockCount > 0 && (
          <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40 font-semibold">
            <AlertTriangle size={10} className="mr-1" /> {lowStockCount} reorder soon
          </Badge>
        )}
      </div>

      <Tabs defaultValue="calc">
        <TabsList className="w-full">
          <TabsTrigger value="calc" className="flex-1 text-xs">
            <FlaskConical size={13} className="mr-1" /> Dosage
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex-1 text-xs">
            <FlaskConical size={13} className="mr-1" /> Recon
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex-1 text-xs">
            <BookOpen size={13} className="mr-1" /> My Calcs
            {savedCalcs.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded-full px-1.5">{savedCalcs.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Dosage calculator tab ─── */}
        <TabsContent value="calc" className="space-y-4 mt-4">
          {/* Peptides */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Peptides in blend
                  <span className="ml-1 text-[10px] text-muted-foreground font-normal">({peptides.length}/4)</span>
                </Label>
                <Button
                  size="sm" variant="outline" className="h-7 text-xs px-2"
                  onClick={addPeptide}
                  disabled={peptides.length >= 4}
                  title={peptides.length >= 4 ? "Maximum 4 peptides per blend" : undefined}
                >
                  <Plus size={11} className="mr-1" /> Add
                </Button>
              </div>
              {peptides.map((pep, i) => (
                <div key={i} className="space-y-2 pb-3 border-b last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="e.g. BPC-157, TB-500"
                      value={pep.name}
                      onChange={e => updatePeptide(i, "name", e.target.value)}
                      className="flex-1 h-9 text-sm"
                    />
                    {peptides.length > 1 && (
                      <button onClick={() => removePeptide(i)} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Vial size (mg)</Label>
                      <Input
                        type="number" min="0.1" step="0.5"
                        value={pep.amountMg}
                        onChange={e => updatePeptide(i, "amountMg", parseFloat(e.target.value) || 0)}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Desired dose</Label>
                      <div className="flex gap-1">
                        <Input
                          type="number" min="0.001"
                          value={pep.desiredDose}
                          onChange={e => updatePeptide(i, "desiredDose", parseFloat(e.target.value) || 0)}
                          className="h-9 text-sm flex-1 min-w-0"
                        />
                        <Select
                          value={pep.doseUnit}
                          onValueChange={v => updatePeptide(i, "doseUnit", v as DoseUnit)}
                        >
                          <SelectTrigger className="h-9 w-16 text-xs px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mcg">mcg</SelectItem>
                            <SelectItem value="mg">mg</SelectItem>
                            <SelectItem value="g">g</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Reconstitution settings */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Reconstitution</Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">BAC water (mL)</Label>
                  <Input
                    type="number" min="0.5" step="0.5"
                    value={bacWaterMl}
                    onChange={e => setBacWaterMl(parseFloat(e.target.value) || 0)}
                    className="h-9 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Syringe type</Label>
                  <Select value={syringeType} onValueChange={v => setSyringeType(v as "U-100" | "U-40")}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="U-100">U-100 (100 u/mL)</SelectItem>
                      <SelectItem value="U-40">U-40 (40 u/mL)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {results.length > 0 && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-semibold text-primary">Dosage Results</Label>

                {/* Syringe ruler */}
                {primaryResult && primaryResult.unitsPerDose > 0 && (
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">
                      {primaryResult.pepName} — draw on syringe
                    </p>
                    <SyringeRuler
                      unitsPerDose={primaryResult.unitsPerDose}
                      mlPerDose={primaryResult.mlPerDose}
                      syringeType={syringeType}
                    />
                  </div>
                )}

                {/* Table */}
                <div className="rounded-xl overflow-hidden border text-xs">
                  <div className="grid grid-cols-4 bg-primary/10 px-3 py-2 font-semibold text-primary">
                    <span>Peptide</span>
                    <span className="text-center">Units</span>
                    <span className="text-center">Draw</span>
                    <span className="text-right">Conc.</span>
                  </div>
                  {results.map((r, i) => (
                    <div key={i} className="grid grid-cols-4 px-3 py-2.5 border-t">
                      <span className="font-medium text-foreground truncate">{r.pepName}</span>
                      <span className="text-center font-mono font-bold text-primary">{r.unitsPerDose}u</span>
                      <span className="text-center font-mono text-foreground">{r.mlPerDose} mL</span>
                      <span className="text-right text-muted-foreground">{r.concentrationMgMl} mg/mL</span>
                    </div>
                  ))}
                  {results.length > 1 && (
                    <div className="grid grid-cols-4 px-3 py-2.5 border-t bg-primary/5">
                      <span className="font-semibold text-foreground col-span-2">Total draw</span>
                      <span className="text-center col-span-2 font-mono font-bold text-primary">
                        {totalMlPerDose} mL
                      </span>
                    </div>
                  )}
                </div>

                {validPeptides.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Est. <span className="font-semibold text-foreground">
                      {estimateTotalDoses(validPeptides.map(p => ({
                        amountMg: p.amountMg,
                        desiredDoseMcg: toMcg(p.desiredDose, p.doseUnit),
                      })))}
                    </span> doses per vial · always verify with your prescriber
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Save */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Save this calculation</Label>
              <Input placeholder="Name (e.g. Morning Blend)" value={calcName}
                onChange={e => setCalcName(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Schedule (e.g. Mon / Thu)" value={schedule}
                onChange={e => setSchedule(e.target.value)} className="h-9 text-sm" />
              <Input placeholder="Notes (optional)" value={notes}
                onChange={e => setNotes(e.target.value)} className="h-9 text-sm" />
              <Button
                className="w-full gradient-primary text-white font-semibold h-10"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || validPeptides.length === 0}
              >
                <Save size={14} className="mr-2" />
                {saveMutation.isPending ? "Saving…" : "Save to My Calcs"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Guide tab ─── */}
        <TabsContent value="guide" className="mt-4">
          <ReconstitutionGuide bacWaterMl={bacWaterMl} peptides={peptides} />
        </TabsContent>

        {/* ─── My Calcs tab ─── */}
        <TabsContent value="saved" className="mt-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
            </div>
          )}
          {!isLoading && savedCalcs.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <FlaskConical size={32} className="mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm font-medium text-foreground">No saved calculations</p>
                <p className="text-xs text-muted-foreground mt-1">Calculate a dose above and save it here</p>
              </CardContent>
            </Card>
          )}
          {savedCalcs.map(calc => (
            <VialCard
              key={calc.id}
              calc={calc}
              onLogDose={id => logDoseMutation.mutate(id)}
              onUndo={id => undoMutation.mutate(id)}
              onDelete={id => deleteMutation.mutate(id)}
              onLearnMore={openPeptideRef}
              isLogging={loggingId === calc.id && logDoseMutation.isPending}
              isUndoing={undoingId === calc.id && undoMutation.isPending}
            />
          ))}
        </TabsContent>
      </Tabs>

      {peptideRefSheet}
    </div>
  );
}
