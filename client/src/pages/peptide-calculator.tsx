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
import { Plus, Trash2, Save, FlaskConical, BookOpen, Syringe, Undo2, ChevronDown, ChevronUp, AlertTriangle, Flame, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PeptideEntry {
  name: string;
  amountMg: number;
  desiredDoseMcg: number;
}

interface CalcResult {
  pepName: string;
  unitsPerDose: number;
  mcgPerUnit: number;
}

interface SavedCalc {
  id: number;
  name: string;
  peptides: PeptideEntry[];
  bacWaterMl: number;
  syringeType: "U-100" | "U-40";
  injectionSchedule: string | null;
  notes: string | null;
  logCount: number;
  lastLoggedAt: string | null;
  createdAt: string;
}

function calcDoses(peptides: PeptideEntry[], bacWaterMl: number, syringeType: "U-100" | "U-40"): CalcResult[] {
  const unitsPerMl = syringeType === "U-100" ? 100 : 40;
  return peptides.map(p => {
    const mcgPerMl = (p.amountMg * 1000) / bacWaterMl;
    const mcgPerUnit = mcgPerMl / unitsPerMl;
    const unitsPerDose = mcgPerUnit > 0 ? p.desiredDoseMcg / mcgPerUnit : 0;
    return {
      pepName: p.name,
      unitsPerDose: Math.round(unitsPerDose * 10) / 10,
      mcgPerUnit: Math.round(mcgPerUnit * 100) / 100,
    };
  });
}

function estimateTotalDoses(peptides: PeptideEntry[]): number {
  if (!peptides.length) return 30;
  const doses = peptides.map(p =>
    p.desiredDoseMcg > 0 ? Math.floor((p.amountMg * 1000) / p.desiredDoseMcg) : 30
  );
  return Math.min(...doses);
}

// SVG syringe ruler that shows graduated markings and a fill indicator
function SyringeRuler({ unitsPerDose, syringeType }: { unitsPerDose: number; syringeType: "U-100" | "U-40" }) {
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
  const totalH = barY + barH + 22;

  return (
    <div className="flex flex-col items-center my-2">
      <svg width={svgW} height={totalH} viewBox={`0 0 ${svgW} ${totalH}`} className="overflow-visible">
        {/* syringe body outline */}
        <rect x={barX} y={barY} width={barW} height={barH} rx={barH / 2} ry={barH / 2}
          className="fill-muted stroke-border" strokeWidth="1.5" />
        {/* fill */}
        {fillW > 0 && (
          <rect
            x={barX} y={barY} width={Math.max(fillW, barH / 2)} height={barH}
            rx={barH / 2} ry={barH / 2}
            className="fill-primary/70"
          />
        )}
        {/* syringe tip */}
        <polygon
          points={`${barX - 1},${barY + 5} ${barX - tipW},${barY + barH / 2} ${barX - 1},${barY + barH - 5}`}
          className="fill-muted stroke-border" strokeWidth="1.5"
        />
        {/* plunger */}
        <rect x={barX + barW - 2} y={barY - 4} width={6} height={barH + 8} rx={2}
          className="fill-border" />

        {/* tick marks */}
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

        {/* draw indicator needle */}
        {unitsPerDose > 0 && (
          <g>
            <line
              x1={barX + fillW} y1={barY + barH + 2}
              x2={barX + fillW} y2={barY + barH + 12}
              className="stroke-amber-500" strokeWidth="2" strokeDasharray="3,2"
            />
            <text
              x={Math.min(Math.max(barX + fillW, barX + 14), barX + barW - 14)}
              y={barY + barH + 21}
              textAnchor="middle"
              className="fill-amber-600 dark:fill-amber-400" fontSize="9" fontWeight="700" fontFamily="monospace">
              {unitsPerDose}u
            </text>
          </g>
        )}
      </svg>
      <p className="text-[10px] text-muted-foreground -mt-1">{syringeType} syringe · draw {unitsPerDose} units</p>
    </div>
  );
}

// Step-by-step reconstitution guide
function ReconstitutionGuide({ bacWaterMl, peptides }: { bacWaterMl: number; peptides: PeptideEntry[] }) {
  const validPeptides = peptides.filter(p => p.name && p.amountMg > 0);
  const steps = [
    {
      n: 1,
      title: "Gather supplies",
      body: "Bacteriostatic water (BAC water), insulin syringe, peptide vial(s), alcohol swabs, and a clean surface.",
    },
    {
      n: 2,
      title: "Clean vial tops",
      body: "Wipe the rubber stopper of each vial and the BAC water bottle with an alcohol swab. Allow to air dry for 30 seconds.",
    },
    {
      n: 3,
      title: "Draw BAC water",
      body: `Draw ${bacWaterMl > 0 ? bacWaterMl : "—"} mL of BAC water into the syringe slowly to avoid foaming.`,
    },
    {
      n: 4,
      title: "Inject into peptide vial",
      body: "Insert the needle into the peptide vial at a slight angle and let the BAC water run down the side of the glass — do not spray directly onto the powder.",
    },
    {
      n: 5,
      title: "Swirl gently",
      body: "Roll the vial gently between your palms until the powder is fully dissolved. Do not shake — this can damage the peptide.",
    },
    {
      n: 6,
      title: "Inspect the solution",
      body: "The solution should be clear with no visible particles. Discard if cloudy or discolored.",
    },
    {
      n: 7,
      title: "Store correctly",
      body: "Store reconstituted peptides in the refrigerator (2–8 °C / 36–46 °F). Most are stable for 4–6 weeks once reconstituted. Label with date.",
    },
  ];

  return (
    <div className="space-y-3">
      {validPeptides.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-primary mb-1">Current blend</p>
            {validPeptides.map((p, i) => (
              <p key={i} className="text-xs text-foreground">
                <span className="font-medium">{p.name}</span>
                {" — "}{p.amountMg} mg vial, reconstitute with {bacWaterMl > 0 ? bacWaterMl : "—"} mL BAC water
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
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

function VialCard({ calc, onLogDose, onUndo, onDelete, isLogging, isUndoing }: {
  calc: SavedCalc;
  onLogDose: (id: number) => void;
  onUndo: (id: number) => void;
  onDelete: (id: number) => void;
  isLogging: boolean;
  isUndoing: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const results = useMemo(
    () => calcDoses(calc.peptides, calc.bacWaterMl, calc.syringeType),
    [calc.peptides, calc.bacWaterMl, calc.syringeType]
  );

  const totalDoses = estimateTotalDoses(calc.peptides);
  const usedDoses = calc.logCount ?? 0;
  const remaining = Math.max(0, totalDoses - usedDoses);
  const remainPct = totalDoses > 0 ? Math.round((remaining / totalDoses) * 100) : 0;
  const isLow = remainPct <= 20 && totalDoses > 0;

  // streak: consecutive days that have a dose logged
  // We approximate from lastLoggedAt + logCount heuristic since we only have counts here
  // A proper streak would require the logs array but we show logCount days as proxy
  const streak = Math.min(usedDoses, 14); // cap display at 14

  // Primary peptide result for the syringe ruler
  const primaryResult = results[0];

  return (
    <Card className={isLow ? "border-amber-400/50" : undefined}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-foreground truncate">{calc.name}</p>
              {isLow && (
                <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40 font-semibold shrink-0">
                  <AlertTriangle size={9} className="mr-0.5" /> Reorder
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {calc.peptides.map(p => p.name).join(" + ")} · {calc.bacWaterMl} mL BAC · {calc.syringeType}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {streak > 0 && (
              <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0 border-orange-400/50 text-orange-600 dark:text-orange-400">
                <Flame size={9} className="fill-orange-500 stroke-none" /> {streak}
              </Badge>
            )}
            <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground p-1">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {/* Doses remaining progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground font-medium">Vial usage</span>
            <span className={`text-[10px] font-semibold ${isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {remaining} / {totalDoses} doses left ({remainPct}%)
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
                <SyringeRuler unitsPerDose={primaryResult.unitsPerDose} syringeType={calc.syringeType} />
              </div>
            )}

            {/* Dosage table */}
            <div className="rounded-xl overflow-hidden border text-xs">
              <div className="grid grid-cols-3 bg-muted/60 px-3 py-1.5 font-semibold text-muted-foreground">
                <span>Peptide</span>
                <span className="text-center">Units</span>
                <span className="text-right">mcg/unit</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-3 px-3 py-1.5 border-t">
                  <span className="font-medium">{r.pepName}</span>
                  <span className="text-center font-mono text-primary font-bold">{r.unitsPerDose}</span>
                  <span className="text-right text-muted-foreground">{r.mcgPerUnit}</span>
                </div>
              ))}
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

        {/* Action row */}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="flex-1 gradient-primary text-white h-9 text-xs font-semibold"
            onClick={() => onLogDose(calc.id)}
            disabled={isLogging}
          >
            <Syringe size={12} className="mr-1" />
            {isLogging ? "Logging…" : "Log Dose"}
          </Button>
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

export default function PeptideCalculator() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [peptides, setPeptides] = useState<PeptideEntry[]>([
    { name: "", amountMg: 5, desiredDoseMcg: 250 },
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
      const response = await apiRequest("POST", "/api/peptide-calcs", {
        name: calcName || `Blend ${new Date().toLocaleDateString()}`,
        peptides,
        bacWaterMl,
        syringeType,
        injectionSchedule: schedule || undefined,
        notes: notes || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
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
      queryClient.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete", variant: "destructive" }),
  });

  const addPeptide = () => setPeptides(p => [...p, { name: "", amountMg: 5, desiredDoseMcg: 250 }]);
  const removePeptide = (i: number) => setPeptides(p => p.filter((_, idx) => idx !== i));
  const updatePeptide = (i: number, key: keyof PeptideEntry, val: string | number) => {
    setPeptides(p => p.map((pep, idx) => idx === i ? { ...pep, [key]: val } : pep));
  };

  const validPeptides = peptides.filter(p => p.name && p.amountMg > 0 && p.desiredDoseMcg > 0);
  const results = validPeptides.length > 0 && bacWaterMl > 0
    ? calcDoses(validPeptides, bacWaterMl, syringeType)
    : [];

  const primaryResult = results[0];
  const lowStockCount = savedCalcs.filter(c => {
    const total = estimateTotalDoses(c.peptides);
    const used = c.logCount ?? 0;
    const pct = total > 0 ? Math.round(((total - used) / total) * 100) : 100;
    return pct <= 20;
  }).length;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Peptide Calculator</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Reconstitution, dosage & vial tracker</p>
        </div>
        {lowStockCount > 0 && (
          <Badge className="text-xs bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/40 font-semibold">
            <AlertTriangle size={10} className="mr-1" /> {lowStockCount} low
          </Badge>
        )}
      </div>

      <Tabs defaultValue="calc">
        <TabsList className="w-full">
          <TabsTrigger value="calc" className="flex-1 text-xs">
            <FlaskConical size={13} className="mr-1" /> Calculator
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex-1 text-xs">
            <Info size={13} className="mr-1" /> Guide
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex-1 text-xs">
            <BookOpen size={13} className="mr-1" /> My Calcs
            {savedCalcs.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary/20 text-primary rounded-full px-1.5">{savedCalcs.length}</span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Calculator tab ── */}
        <TabsContent value="calc" className="space-y-4 mt-4">
          {/* Peptides */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Peptides in blend</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={addPeptide}>
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
                      <Label className="text-[10px] text-muted-foreground">Desired dose (mcg)</Label>
                      <Input
                        type="number" min="1"
                        value={pep.desiredDoseMcg}
                        onChange={e => updatePeptide(i, "desiredDoseMcg", parseFloat(e.target.value) || 0)}
                        className="h-9 text-sm"
                      />
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

          {/* Results + Syringe ruler */}
          {results.length > 0 && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-3">
                <Label className="text-sm font-semibold text-primary">Dosage Results</Label>

                {/* Syringe ruler for primary peptide */}
                {primaryResult && primaryResult.unitsPerDose > 0 && (
                  <div className="bg-muted/30 rounded-xl p-3">
                    <p className="text-[10px] text-muted-foreground font-semibold mb-1 uppercase tracking-wide">
                      {primaryResult.pepName} — draw on syringe
                    </p>
                    <SyringeRuler unitsPerDose={primaryResult.unitsPerDose} syringeType={syringeType} />
                  </div>
                )}

                {/* Table */}
                <div className="rounded-xl overflow-hidden border text-sm">
                  <div className="grid grid-cols-3 bg-primary/10 px-3 py-2 font-semibold text-primary text-xs">
                    <span>Peptide</span>
                    <span className="text-center">Draw (units)</span>
                    <span className="text-right">mcg/unit</span>
                  </div>
                  {results.map((r, i) => (
                    <div key={i} className="grid grid-cols-3 px-3 py-2.5 border-t">
                      <span className="font-medium text-foreground">{r.pepName}</span>
                      <span className="text-center font-mono font-bold text-lg text-primary leading-none">{r.unitsPerDose}</span>
                      <span className="text-right text-muted-foreground text-xs">{r.mcgPerUnit} mcg</span>
                    </div>
                  ))}
                </div>

                {/* Estimated doses */}
                {validPeptides.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Est. <span className="font-semibold text-foreground">{estimateTotalDoses(validPeptides)}</span> doses per vial · always verify with your prescriber
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Save */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Save this calculation</Label>
              <Input
                placeholder="Name (e.g. Morning Blend)"
                value={calcName}
                onChange={e => setCalcName(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Schedule (e.g. Mon / Thu)"
                value={schedule}
                onChange={e => setSchedule(e.target.value)}
                className="h-9 text-sm"
              />
              <Input
                placeholder="Notes (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="h-9 text-sm"
              />
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

        {/* ── Guide tab ── */}
        <TabsContent value="guide" className="mt-4">
          <ReconstitutionGuide bacWaterMl={bacWaterMl} peptides={peptides} />
        </TabsContent>

        {/* ── My Calcs tab ── */}
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
              isLogging={loggingId === calc.id && logDoseMutation.isPending}
              isUndoing={undoingId === calc.id && undoMutation.isPending}
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
