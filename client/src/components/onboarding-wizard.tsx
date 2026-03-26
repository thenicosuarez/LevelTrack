import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Syringe, Calendar, Scale, ChevronRight, ChevronLeft, Check } from "lucide-react";
import type { User } from "@shared/schema";
import { kgToLbs } from "@/lib/weight-utils";

const INJECTION_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NONE = "__none__";

const step1Schema = z.object({
  glp1Drug: z.string().min(1, "Please select a medication"),
  glp1Dose: z.string().min(1, "Dose is required"),
  glp1DoseUnit: z.string().min(1),
});

const step2Schema = z.object({
  glp1InjectionFrequency: z.enum(["daily", "weekly", "biweekly"]),
  glp1InjectionDay: z.string(),
  glp1StartDate: z.string().optional(),
});

const step3Schema = z.object({
  weight: z.string().optional(),
  weightUnit: z.enum(["lbs", "kg"]),
  goalWeight: z.string().optional(),
  heightCm: z.string().optional().refine((v) => {
    if (!v || v === "") return true;
    const n = parseInt(v);
    return !isNaN(n) && n >= 50 && n <= 272;
  }, { message: "Height must be between 50 and 272 cm" }),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;

const STEPS = [
  { title: "Your Medication", subtitle: "What are you taking?", icon: Syringe },
  { title: "Injection Schedule", subtitle: "When do you inject?", icon: Calendar },
  { title: "Starting Weight", subtitle: "Optional — track your progress", icon: Scale },
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  const { data: drugs = [] } = useQuery<{ name: string; category: string; units: string[]; defaultUnit: string }[]>({
    queryKey: ["/api/drugs"],
  });

  const { data: user } = useQuery<User>({ queryKey: ["/api/user"] });
  const weightUnit = (user?.weightUnit as "lbs" | "kg") ?? "lbs";

  const form1 = useForm<Step1>({
    resolver: zodResolver(step1Schema),
    defaultValues: { glp1Drug: "", glp1Dose: "", glp1DoseUnit: "mg" },
  });

  const form2 = useForm<Step2>({
    resolver: zodResolver(step2Schema),
    defaultValues: { glp1InjectionFrequency: "weekly", glp1InjectionDay: NONE, glp1StartDate: "" },
  });
  const watchedFrequency = form2.watch("glp1InjectionFrequency");

  const form3 = useForm<Step3>({
    resolver: zodResolver(step3Schema),
    defaultValues: { weight: "", weightUnit, goalWeight: "", heightCm: "" },
  });

  const selectedDrug = drugs.find((d) => d.name === form1.watch("glp1Drug"));

  const completeMutation = useMutation({
    mutationFn: async (data: { s1: Step1; s2: Step2; s3: Step3 }) => {
      const rawWeight = data.s3.weight ? parseFloat(data.s3.weight) : null;
      const rawGoal = data.s3.goalWeight ? parseFloat(data.s3.goalWeight) : null;
      const isKg = data.s3.weightUnit === "kg";
      const weightLbs = rawWeight != null && isKg ? kgToLbs(rawWeight) : rawWeight;
      const goalLbs = rawGoal != null && isKg ? kgToLbs(rawGoal) : rawGoal;

      const heightCmVal = data.s3.heightCm ? parseInt(data.s3.heightCm) : null;
      await apiRequest("PATCH", "/api/user/settings", {
        glp1Drug: data.s1.glp1Drug,
        glp1Dose: parseFloat(data.s1.glp1Dose),
        glp1DoseUnit: data.s1.glp1DoseUnit,
        glp1InjectionFrequency: data.s2.glp1InjectionFrequency,
        glp1InjectionDay: data.s2.glp1InjectionFrequency === "daily"
          ? null
          : (data.s2.glp1InjectionDay !== NONE ? data.s2.glp1InjectionDay : null),
        glp1StartDate: data.s2.glp1StartDate || null,
        weightUnit: data.s3.weightUnit,
        goalWeight: goalLbs,
        heightCm: heightCmVal,
        hasCompletedOnboarding: true,
      });

      if (weightLbs != null) {
        const today = new Date().toISOString().split("T")[0];
        await apiRequest("POST", "/api/progress-photos", {
          date: today,
          weight: weightLbs,
          notes: "Starting weight",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/progress-photos"] });
      toast({ title: "Setup complete!", description: "Welcome to LevelTrack." });
      onComplete();
    },
    onError: () => {
      toast({ title: "Setup failed", variant: "destructive" });
    },
  });

  const handleNext = async () => {
    if (step === 0) {
      const ok = await form1.trigger();
      if (ok) setStep(1);
    } else if (step === 1) {
      const ok = await form2.trigger();
      if (ok) {
        const freq = form2.getValues("glp1InjectionFrequency");
        const day = form2.getValues("glp1InjectionDay");
        if (freq !== "daily" && (!day || day === NONE)) {
          form2.setError("glp1InjectionDay", { message: "Please select an injection day" });
          return;
        }
        setStep(2);
      }
    } else {
      const ok = await form3.trigger();
      if (ok) {
        completeMutation.mutate({ s1: form1.getValues(), s2: form2.getValues(), s3: form3.getValues() });
      }
    }
  };

  const StepIcon = STEPS[step].icon;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <div
            className="h-full gradient-primary transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
              <StepIcon size={20} className="text-white" />
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Step {step + 1} of {STEPS.length}
              </div>
              <h2 className="text-lg font-bold text-foreground leading-tight">{STEPS[step].title}</h2>
              <p className="text-sm text-muted-foreground">{STEPS[step].subtitle}</p>
            </div>
          </div>

          {/* Step 1: Medication */}
          {step === 0 && (
            <Form {...form1}>
              <form className="space-y-4">
                <FormField
                  control={form1.control}
                  name="glp1Drug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Medication</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          const drug = drugs.find((d) => d.name === val);
                          if (drug) form1.setValue("glp1DoseUnit", drug.defaultUnit);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder="Select your medication…" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {drugs.map((d) => (
                            <SelectItem key={d.name} value={d.name}>
                              {d.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex gap-3">
                  <FormField
                    control={form1.control}
                    name="glp1Dose"
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormLabel className="text-sm font-medium">Dose</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g. 0.5"
                            className="h-11"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form1.control}
                    name="glp1DoseUnit"
                    render={({ field }) => (
                      <FormItem className="w-24">
                        <FormLabel className="text-sm font-medium">Unit</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(selectedDrug?.units ?? ["mg", "mcg"]).map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </form>
            </Form>
          )}

          {/* Step 2: Injection schedule */}
          {step === 1 && (
            <Form {...form2}>
              <form className="space-y-4">
                <FormField
                  control={form2.control}
                  name="glp1InjectionFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Frequency</FormLabel>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { value: "daily", label: "Daily" },
                          { value: "weekly", label: "Weekly" },
                          { value: "biweekly", label: "Bi-weekly" },
                        ] as const).map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => field.onChange(value)}
                            className={`h-10 rounded-lg text-sm font-medium transition-colors ${
                              field.value === value
                                ? "gradient-primary text-white shadow"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {watchedFrequency !== "daily" && (
                <FormField
                  control={form2.control}
                  name="glp1InjectionDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Injection Day</FormLabel>
                      <div className="grid grid-cols-7 gap-1">
                        {INJECTION_DAYS.map((day) => (
                          <button
                            key={day}
                            type="button"
                            onClick={() => field.onChange(day)}
                            className={`h-10 rounded-lg text-xs font-medium transition-colors ${
                              field.value === day
                                ? "gradient-primary text-white shadow"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                )}
                <FormField
                  control={form2.control}
                  name="glp1StartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Start Date (optional)</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-11" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          )}

          {/* Step 3: Weight */}
          {step === 2 && (
            <Form {...form3}>
              <form className="space-y-4">
                <FormField
                  control={form3.control}
                  name="weightUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Weight Unit</FormLabel>
                      <div className="flex gap-2">
                        {(["lbs", "kg"] as const).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => field.onChange(u)}
                            className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                              field.value === u
                                ? "gradient-primary text-white shadow"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            }`}
                          >
                            {u === "lbs" ? "lbs (pounds)" : "kg (kilograms)"}
                          </button>
                        ))}
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form3.control}
                  name="weight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Current Weight ({form3.watch("weightUnit")}) — optional
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder={form3.watch("weightUnit") === "kg" ? "e.g. 95" : "e.g. 210"}
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form3.control}
                  name="goalWeight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Goal Weight ({form3.watch("weightUnit")}) — optional
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder={form3.watch("weightUnit") === "kg" ? "e.g. 80" : "e.g. 175"}
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form3.control}
                  name="heightCm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">
                        Height (cm) — optional, for BMI
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="e.g. 175"
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Weight creates your first progress entry and appears on analytics. Height is used to calculate BMI on your dashboard.
                </p>
              </form>
            </Form>
          )}

          {/* Navigation */}
          <div className="flex items-center gap-3 pt-1">
            {step > 0 ? (
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={() => setStep(step - 1)}
                disabled={completeMutation.isPending}
              >
                <ChevronLeft size={16} className="mr-1" />
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="flex-1 h-11 text-muted-foreground"
                onClick={async () => {
                  await apiRequest("PATCH", "/api/user/settings", { hasCompletedOnboarding: true });
                  queryClient.invalidateQueries({ queryKey: ["/api/user"] });
                  onComplete();
                }}
              >
                Skip setup
              </Button>
            )}
            <Button
              className="flex-1 h-11 gradient-primary text-white font-semibold"
              onClick={handleNext}
              disabled={completeMutation.isPending}
            >
              {step === 2 ? (
                completeMutation.isPending ? "Saving…" : (
                  <>
                    <Check size={16} className="mr-1" />
                    Finish
                  </>
                )
              ) : (
                <>
                  Next
                  <ChevronRight size={16} className="ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
