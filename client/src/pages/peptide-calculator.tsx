import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, FlaskConical, BookOpen, Syringe, Undo2, ChevronDown, ChevronUp } from "lucide-react";
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
    return { pepName: p.name, unitsPerDose: Math.round(unitsPerDose * 10) / 10, mcgPerUnit: Math.round(mcgPerUnit * 100) / 100 };
  });
}

function VialCard({ calc, onLogDose, onUndo, onDelete }: {
  calc: SavedCalc;
  onLogDose: (id: number) => void;
  onUndo: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const results = calcDoses(calc.peptides, calc.bacWaterMl, calc.syringeType);
  const logsLeft = Math.max(0, 30 - (calc.logCount ?? 0)); // estimate ~30 doses per vial

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{calc.name}</p>
            <p className="text-xs text-muted-foreground">
              {calc.peptides.map(p => p.name).join(" + ")} · {calc.bacWaterMl}mL BAC
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs shrink-0">{calc.logCount ?? 0} doses</Badge>
            <button onClick={() => setExpanded(e => !e)} className="text-muted-foreground p-1">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 space-y-2">
            <div className="rounded-xl overflow-hidden border text-xs">
              <div className="grid grid-cols-3 bg-muted/60 px-3 py-1.5 font-semibold text-muted-foreground">
                <span>Peptide</span>
                <span className="text-center">Units</span>
                <span className="text-right">mcg/unit</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-3 px-3 py-1.5 border-t">
                  <span className="font-medium">{r.pepName}</span>
                  <span className="text-center font-mono text-primary">{r.unitsPerDose}</span>
                  <span className="text-right text-muted-foreground">{r.mcgPerUnit}</span>
                </div>
              ))}
            </div>
            {calc.notes && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">{calc.notes}</p>
            )}
            {calc.lastLoggedAt && (
              <p className="text-[10px] text-muted-foreground">Last dose: {new Date(calc.lastLoggedAt).toLocaleDateString()}</p>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="flex-1 gradient-primary text-white h-9 text-xs font-semibold"
            onClick={() => onLogDose(calc.id)}
          >
            <Syringe size={12} className="mr-1" /> Log Dose
          </Button>
          <Button size="sm" variant="outline" className="h-9 px-3" onClick={() => onUndo(calc.id)}>
            <Undo2 size={12} />
          </Button>
          <Button size="sm" variant="ghost" className="h-9 px-3 text-red-400 hover:text-red-600" onClick={() => onDelete(calc.id)}>
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
      setCalcName("");
    },
    onError: () => toast({ title: "Error", description: "Failed to save calculation", variant: "destructive" }),
  });

  const logDoseMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/peptide-calcs/${id}/logs`, {});
      return response.json();
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Dose logged!", description: "Added to vial tracker." });
    },
    onError: () => toast({ title: "Error", description: "Failed to log dose", variant: "destructive" }),
  });

  const undoMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/peptide-calcs/${id}/logs/last`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/peptide-calcs'] });
      toast({ title: "Undone", description: "Last dose removed." });
    },
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
  });

  const addPeptide = () => setPeptides(p => [...p, { name: "", amountMg: 5, desiredDoseMcg: 250 }]);
  const removePeptide = (i: number) => setPeptides(p => p.filter((_, idx) => idx !== i));
  const updatePeptide = (i: number, key: keyof PeptideEntry, val: string | number) => {
    setPeptides(p => p.map((pep, idx) => idx === i ? { ...pep, [key]: val } : pep));
  };

  const validPeptides = peptides.filter(p => p.name && p.amountMg > 0 && p.desiredDoseMcg > 0);
  const results = validPeptides.length > 0 && bacWaterMl > 0 ? calcDoses(validPeptides, bacWaterMl, syringeType) : [];

  return (
    <div className="px-4 py-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Peptide Calculator</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Reconstitution & dosage reference</p>
      </div>

      <Tabs defaultValue="calc">
        <TabsList className="w-full">
          <TabsTrigger value="calc" className="flex-1">
            <FlaskConical size={13} className="mr-1" /> Calculator
          </TabsTrigger>
          <TabsTrigger value="saved" className="flex-1">
            <BookOpen size={13} className="mr-1" /> My Calcs ({savedCalcs.length})
          </TabsTrigger>
        </TabsList>

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

          {/* Results */}
          {results.length > 0 && (
            <Card className="border-primary/30">
              <CardContent className="p-4">
                <Label className="text-sm font-semibold text-primary mb-3 block">Dosage Results</Label>
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
                <p className="text-[10px] text-muted-foreground mt-2">
                  Draw the listed units for your dose. Always verify with your prescriber.
                </p>
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

        <TabsContent value="saved" className="mt-4 space-y-3">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2].map(i => <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />)}
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
            />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
