import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Syringe, Trash2, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Glp1Log } from "@shared/schema";
import { todayLocal } from "@/lib/date-utils";

interface Drug {
  name: string;
  category: string;
  generic: string;
  units: string[];
  defaultUnit: string;
}

const INJECTION_SITES = [
  { id: "abdomen", label: "Abdomen", emoji: "🫁" },
  { id: "thigh", label: "Thigh", emoji: "🦵" },
  { id: "upper-arm", label: "Upper Arm", emoji: "💪" },
  { id: "buttocks", label: "Buttocks", emoji: "🍑" },
];

const FORMULATIONS = [
  "Pre-filled pen",
  "Vial / syringe",
  "Auto-injector",
  "Patch",
  "Other",
];

const CUSTOM_DRUG_VALUE = "__custom__";

const formSchema = z.object({
  drugName: z.string().min(1, "Please select a drug"),
  customDrugName: z.string().optional(),
  doseAmount: z.number({ invalid_type_error: "Enter a dose amount" }).positive("Must be positive"),
  doseUnit: z.string().min(1, "Select a unit"),
  formulation: z.string().optional(),
  time: z.string().min(1, "Select a time"),
  injectionSite: z.string().optional(),
  painScore: z.number().min(0).max(10),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

function getNow() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSite(site: string | null | undefined) {
  if (!site) return "";
  return site.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function PainDots({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = score <= 3 ? "bg-green-500" : score <= 6 ? "bg-yellow-500" : "bg-red-500";
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < score ? color : "bg-muted"}`} />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{score}/10</span>
    </span>
  );
}

export default function LogShot() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [injectionSite, setInjectionSite] = useState<string>("");
  const [painScore, setPainScore] = useState<number>(0);

  const { data: drugs = [] } = useQuery<Drug[]>({
    queryKey: ["/api/drugs"],
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<Glp1Log[]>({
    queryKey: ["/api/glp1-logs"],
  });

  const today = todayLocal();
  const todayLog = logs.find((l) => l.date === today);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      drugName: "",
      customDrugName: "",
      doseAmount: undefined,
      doseUnit: "mg",
      formulation: "",
      time: getNow(),
      injectionSite: "",
      painScore: 0,
      notes: "",
    },
  });

  const createLogMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const resolvedDrugName =
        data.drugName === CUSTOM_DRUG_VALUE
          ? (data.customDrugName?.trim() || "Custom")
          : data.drugName;
      const response = await apiRequest("POST", "/api/glp1-logs", {
        drugName: resolvedDrugName,
        doseAmount: data.doseAmount,
        doseUnit: data.doseUnit,
        formulation: data.formulation || undefined,
        time: data.time,
        date: today,
        injectionSite: injectionSite || undefined,
        painScore,
        notes: data.notes || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/glp1-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({ title: "Shot logged!", description: "Your injection has been recorded." });
      reset({ drugName: "", customDrugName: "", doseAmount: undefined, doseUnit: "mg", formulation: "", time: getNow(), notes: "" });
      setSelectedDrug(null);
      setInjectionSite("");
      setPainScore(0);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to log shot. Please try again.", variant: "destructive" });
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/glp1-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/glp1-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      toast({ title: "Deleted", description: "Shot record removed." });
    },
  });

  const handleDrugChange = (name: string) => {
    const drug = drugs.find((d) => d.name === name);
    setSelectedDrug(drug || null);
    if (drug) setValue("doseUnit", drug.defaultUnit);
    setValue("drugName", name);
    if (name !== CUSTOM_DRUG_VALUE) setValue("customDrugName", "");
  };

  const onSubmit = (data: FormValues) => {
    createLogMutation.mutate(data);
  };

  return (
    <div className="px-4 py-5 space-y-5">

      {/* Today's status banner */}
      {todayLog && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
          <CheckCircle2 size={20} className="text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Shot logged today</p>
            <p className="text-xs text-green-700">
              {todayLog.drugName} {todayLog.doseAmount}{todayLog.doseUnit}
              {todayLog.injectionSite ? ` · ${formatSite(todayLog.injectionSite)}` : ""} · {todayLog.time}
            </p>
          </div>
        </div>
      )}

      {/* Log Shot Form */}
      <Card>
        <CardContent className="p-5 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center shrink-0">
              <Syringe className="text-white" size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground leading-tight">Log a Shot</h2>
              <p className="text-xs text-muted-foreground">Record your injection details</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Drug selector */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Drug / Peptide</Label>
              <Controller
                name="drugName"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={(v) => { field.onChange(v); handleDrugChange(v); }} value={field.value}>
                    <SelectTrigger className="h-12 text-sm">
                      <SelectValue placeholder="Select drug..." />
                    </SelectTrigger>
                    <SelectContent>
                      {["GLP-1", "GLP-1/GIP", "Peptide", "Custom"].map((cat) => (
                        <div key={cat}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {cat}
                          </div>
                          {drugs.filter((d) => d.category === cat).map((d) => (
                            <SelectItem key={d.name} value={d.name}>
                              <span className="font-medium">{d.name}</span>
                              {d.generic && d.generic !== d.name && (
                                <span className="ml-1.5 text-muted-foreground text-xs">({d.generic})</span>
                              )}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-t mt-1">
                        Other
                      </div>
                      <SelectItem value={CUSTOM_DRUG_VALUE}>
                        <span className="font-medium">Custom / Other drug...</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.drugName && <p className="text-xs text-destructive">{errors.drugName.message}</p>}
            </div>

            {/* Custom drug name text input */}
            {watch("drugName") === CUSTOM_DRUG_VALUE && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Drug / Compound Name</Label>
                <Input
                  type="text"
                  placeholder="e.g. Retatrutide, Cagrilintide, custom peptide..."
                  className="h-12"
                  {...register("customDrugName")}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Enter the exact name of your drug or compound</p>
              </div>
            )}

            {/* Dose amount + unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Dose</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 0.5"
                  className="h-12"
                  {...register("doseAmount", { valueAsNumber: true })}
                />
                {errors.doseAmount && <p className="text-xs text-destructive">{errors.doseAmount.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Unit</Label>
                <Controller
                  name="doseUnit"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(selectedDrug?.units ?? ["mg", "mcg", "IU", "units", "ml"]).map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            {/* Formulation + Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Formulation</Label>
                <Controller
                  name="formulation"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMULATIONS.map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Time</Label>
                <div className="relative">
                  <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="time"
                    className="h-12 pl-8"
                    {...register("time")}
                  />
                </div>
                {errors.time && <p className="text-xs text-destructive">{errors.time.message}</p>}
              </div>
            </div>

            {/* Injection site */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Injection Site</Label>
              <div className="grid grid-cols-2 gap-2">
                {INJECTION_SITES.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    onClick={() => setInjectionSite(site.id === injectionSite ? "" : site.id)}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                      injectionSite === site.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    }`}
                  >
                    <span className="text-lg leading-none">{site.emoji}</span>
                    <span>{site.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Pain score */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Pain / Discomfort</Label>
                <span className="text-sm font-semibold text-primary">{painScore}/10</span>
              </div>
              <div className="px-1">
                <Slider
                  min={0}
                  max={10}
                  step={1}
                  value={[painScore]}
                  onValueChange={([v]) => setPainScore(v)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                  <span>None</span>
                  <span>Moderate</span>
                  <span>Severe</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Notes (optional)</Label>
              <Textarea
                placeholder="Any observations, symptoms, or reminders..."
                className="resize-none text-sm"
                rows={2}
                {...register("notes")}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-sm font-semibold gradient-primary text-white border-0"
              disabled={createLogMutation.isPending}
            >
              {createLogMutation.isPending ? "Logging..." : "Log Shot"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Shot History */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground">Shot History</h3>
          <span className="text-xs text-muted-foreground">{logs.length} total</span>
        </div>

        {logsLoading ? (
          <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">Loading...</CardContent></Card>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle size={32} className="mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No shots logged yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-foreground">{log.drugName}</span>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                          {log.doseAmount}{log.doseUnit}
                        </span>
                        {log.formulation && (
                          <span className="text-xs text-muted-foreground">{log.formulation}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span>{formatDate(log.date)} · {log.time}</span>
                        {log.injectionSite && (
                          <span>📍 {formatSite(log.injectionSite)}</span>
                        )}
                      </div>
                      {log.painScore != null && log.painScore > 0 && (
                        <PainDots score={log.painScore} />
                      )}
                      {log.notes && (
                        <p className="text-xs text-muted-foreground italic mt-1 line-clamp-2">{log.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteLogMutation.mutate(log.id)}
                      disabled={deleteLogMutation.isPending}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors touch-target flex items-center justify-center"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
