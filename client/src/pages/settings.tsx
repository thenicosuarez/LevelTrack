import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Syringe, Target, Info, Pencil, Check, X } from "lucide-react";
import type { User } from "@shared/schema";

const NONE = "__none__";
const INJECTION_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const INJECTION_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
];
const DOSE_UNITS = ["mg", "mcg", "IU", "units", "ml"];

const settingsSchema = z.object({
  glp1Drug: z.string(),
  glp1Dose: z.string(),
  glp1DoseUnit: z.string(),
  glp1InjectionFrequency: z.string(),
  glp1InjectionDay: z.string(),
  glp1StartDate: z.string(),
  goalWeight: z.string(),
  weightUnit: z.enum(["lbs", "kg"]),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

function toFormStr(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}

function toFormSelect(v: string | null | undefined): string {
  return v ?? NONE;
}

function fromFormSelect(v: string): string | null {
  return v === NONE ? null : v;
}

function fromFormNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) || v === "" ? null : n;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const { data: drugs = [] } = useQuery<{ name: string; category: string }[]>({
    queryKey: ["/api/drugs"],
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      glp1Drug: toFormSelect(user?.glp1Drug),
      glp1Dose: toFormStr(user?.glp1Dose),
      glp1DoseUnit: user?.glp1DoseUnit ?? "mg",
      glp1InjectionFrequency: toFormSelect(user?.glp1InjectionFrequency),
      glp1InjectionDay: toFormSelect(user?.glp1InjectionDay),
      glp1StartDate: user?.glp1StartDate ?? "",
      goalWeight: toFormStr(user?.goalWeight),
      weightUnit: (user?.weightUnit as "lbs" | "kg") ?? "lbs",
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("PATCH", "/api/user", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      setIsEditingName(false);
      toast({ title: "Name updated" });
    },
    onError: () => {
      toast({ title: "Failed to update name", variant: "destructive" });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      const payload = {
        weightUnit: data.weightUnit,
        glp1Drug: fromFormSelect(data.glp1Drug),
        glp1Dose: fromFormNum(data.glp1Dose),
        glp1DoseUnit: fromFormSelect(data.glp1DoseUnit),
        glp1InjectionFrequency: fromFormSelect(data.glp1InjectionFrequency),
        glp1InjectionDay: fromFormSelect(data.glp1InjectionDay),
        glp1StartDate: data.glp1StartDate || null,
        goalWeight: fromFormNum(data.goalWeight),
      };
      const res = await apiRequest("PATCH", "/api/user/settings", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const onSubmit = (data: SettingsFormValues) => {
    updateSettingsMutation.mutate(data);
  };

  const handleEditName = () => {
    setEditedName(user?.name || "");
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    if (editedName.trim()) {
      updateNameMutation.mutate(editedName.trim());
    }
  };

  const handleCancelName = () => {
    setIsEditingName(false);
  };

  const glp1Drugs = drugs.filter((d) => d.category !== "Custom");
  const weightLabel = form.watch("weightUnit") === "kg" ? "kg" : "lbs";

  return (
    <div className="px-4 py-6 space-y-5 pb-8">

      {/* Profile Card */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
              <AvatarFallback className="text-base font-bold bg-primary text-primary-foreground">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") handleCancelName();
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={handleSaveName}
                    disabled={updateNameMutation.isPending}
                  >
                    <Check size={14} className="text-green-600" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={handleCancelName}
                  >
                    <X size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground truncate">
                    {user?.name || "Your Name"}
                  </p>
                  <button
                    onClick={handleEditName}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
              <p className="text-xs text-muted-foreground truncate mt-0.5">{user?.email}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="secondary" className="text-[10px]">
                  {user?.streak || 0} day streak
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

          {/* Medication Card */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 gradient-primary rounded-lg flex items-center justify-center">
                  <Syringe size={13} className="text-white" />
                </div>
                <span className="text-sm font-bold text-foreground">GLP-1 Medication</span>
              </div>

              <FormField
                control={form.control}
                name="glp1Drug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Medication</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select medication" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {glp1Drugs.map((d) => (
                          <SelectItem key={d.name} value={d.name}>
                            {d.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="glp1Dose"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Dose</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="e.g. 0.5"
                          className="h-10"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="glp1DoseUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Unit</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DOSE_UNITS.map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="glp1InjectionFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Injection Frequency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Not set</SelectItem>
                        {INJECTION_FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="glp1InjectionDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Injection Day</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select day" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Not set</SelectItem>
                          {INJECTION_DAYS.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="glp1StartDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground">Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" className="h-10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Goals & Units Card */}
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 gradient-primary rounded-lg flex items-center justify-center">
                  <Target size={13} className="text-white" />
                </div>
                <span className="text-sm font-bold text-foreground">Goals & Units</span>
              </div>

              <FormField
                control={form.control}
                name="weightUnit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Weight Unit</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="lbs">lbs (pounds)</SelectItem>
                        <SelectItem value="kg">kg (kilograms)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="goalWeight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Goal Weight ({weightLabel})
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder={`e.g. ${weightLabel === "kg" ? "73" : "160"}`}
                        className="h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="text-[10px] text-muted-foreground">
                Goal weight appears as a dashed target line on your analytics weight chart.
              </p>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full gradient-primary text-white font-semibold h-11 rounded-xl"
            disabled={updateSettingsMutation.isPending}
          >
            {updateSettingsMutation.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </form>
      </Form>

      {/* About */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center">
              <Info size={13} className="text-muted-foreground" />
            </div>
            <span className="text-sm font-bold text-foreground">About</span>
          </div>
          <Separator className="mb-3" />
          <div className="text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">LevelTrack</p>
            <p className="text-xs text-muted-foreground">Version 1.0.0</p>
            <p className="text-xs text-muted-foreground">Your GLP-1 & metabolic health tracker</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
