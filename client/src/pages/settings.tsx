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
import { useState, useEffect } from "react";
import { Syringe, Target, Info, Pencil, Check, X, Bell, BellOff, RefreshCw, Sun, Moon, Monitor, Smartphone, Wifi, WifiOff, RotateCcw, LogOut } from "lucide-react";
import type { User } from "@shared/schema";
import { useTheme } from "@/lib/theme-provider";
import { kgToLbs, convertWeight, lbsToKg } from "@/lib/weight-utils";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
  registerServiceWorker,
} from "@/lib/push-notifications";
import { Switch } from "@/components/ui/switch";
import OnboardingWizard from "@/components/onboarding-wizard";

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
  heightCm: z.string(),
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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [pushBusy, setPushBusy] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleThemeChange = async (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    try {
      await apiRequest("PATCH", "/api/user/settings", { theme: newTheme });
    } catch { /* non-critical */ }
  };

  const { data: user } = useQuery<User>({
    queryKey: ["/api/user"],
  });

  const { data: drugs = [] } = useQuery<{ name: string; category: string }[]>({
    queryKey: ["/api/drugs"],
  });

  interface DeviceStatus { connected: boolean; lastSync: string | null; configured: boolean }
  const { data: deviceStatus, refetch: refetchDevices } = useQuery<{ withings: DeviceStatus; oura: DeviceStatus }>({
    queryKey: ["/api/device-integrations"],
    refetchOnMount: true,
  });

  const [syncingDevice, setSyncingDevice] = useState<"withings" | "oura" | null>(null);

  const handleSyncDevice = async (device: "withings" | "oura") => {
    setSyncingDevice(device);
    try {
      const res = await apiRequest("POST", `/api/integrations/${device}/sync`, {});
      const data = await res.json();
      if (data.error) {
        toast({ title: "Sync issue", description: data.error, variant: "destructive" });
      } else if (data.synced !== undefined) {
        toast({ title: `${device === "withings" ? "Withings" : "Oura"} synced`, description: `${data.synced} new record${data.synced === 1 ? "" : "s"} imported.` });
      } else {
        toast({ title: "Sync issue", description: "Unknown error", variant: "destructive" });
      }
      refetchDevices();
      if (device === "withings") {
        queryClient.invalidateQueries({ queryKey: ["/api/progress-photos"] });
        queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/oura-daily"] });
      }
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    }
    setSyncingDevice(null);
  };

  const handleDisconnectDevice = async (device: "withings" | "oura") => {
    try {
      await apiRequest("DELETE", `/api/integrations/${device}`, {});
      toast({ title: `${device === "withings" ? "Withings" : "Oura"} disconnected` });
      refetchDevices();
    } catch {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    }
  };

  // Sync reminder state from user data
  useEffect(() => {
    if (user) {
      setReminderEnabled(user.reminderEnabled ?? false);
      setReminderTime(user.reminderTime ?? "09:00");
    }
  }, [user?.reminderEnabled, user?.reminderTime]);

  // Check push subscription status on mount
  useEffect(() => {
    registerServiceWorker().then(() => {
      getCurrentSubscription().then((sub) => setIsSubscribed(!!sub));
    });
  }, []);

  const storedWeightUnit = (user?.weightUnit as "lbs" | "kg") ?? "lbs";
  const displayGoalWeight = user?.goalWeight != null
    ? convertWeight(user.goalWeight, storedWeightUnit)
    : null;

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    values: {
      glp1Drug: toFormSelect(user?.glp1Drug),
      glp1Dose: toFormStr(user?.glp1Dose),
      glp1DoseUnit: user?.glp1DoseUnit ?? "mg",
      glp1InjectionFrequency: toFormSelect(user?.glp1InjectionFrequency),
      glp1InjectionDay: toFormSelect(user?.glp1InjectionDay),
      glp1StartDate: user?.glp1StartDate ?? "",
      goalWeight: toFormStr(displayGoalWeight),
      weightUnit: storedWeightUnit,
      heightCm: toFormStr(user?.heightCm),
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
      const rawGoalWeight = fromFormNum(data.goalWeight);
      const goalWeightLbs = rawGoalWeight != null && data.weightUnit === "kg"
        ? kgToLbs(rawGoalWeight)
        : rawGoalWeight;
      const payload = {
        weightUnit: data.weightUnit,
        glp1Drug: fromFormSelect(data.glp1Drug),
        glp1Dose: fromFormNum(data.glp1Dose),
        glp1DoseUnit: fromFormSelect(data.glp1DoseUnit),
        glp1InjectionFrequency: fromFormSelect(data.glp1InjectionFrequency),
        glp1InjectionDay: fromFormSelect(data.glp1InjectionDay),
        glp1StartDate: data.glp1StartDate || null,
        goalWeight: goalWeightLbs,
        heightCm: fromFormNum(data.heightCm),
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

  const handleToggleReminder = async (enabled: boolean) => {
    if (!isPushSupported()) {
      toast({ title: "Not supported", description: "Push notifications are not supported in this browser.", variant: "destructive" });
      return;
    }
    setPushBusy(true);
    try {
      if (enabled) {
        const sub = await subscribeToPush();
        if (!sub) {
          toast({ title: "Permission denied", description: "Allow notifications to enable reminders.", variant: "destructive" });
          setPushBusy(false);
          return;
        }
        await apiRequest("POST", "/api/push/subscribe", {
          endpoint: sub.endpoint,
          keys: {
            p256dh: btoa(String.fromCharCode(...new Uint8Array(await sub.getKey("p256dh") as ArrayBuffer))),
            auth: btoa(String.fromCharCode(...new Uint8Array(await sub.getKey("auth") as ArrayBuffer))),
          },
        });
        setIsSubscribed(true);
        await apiRequest("PATCH", "/api/user/settings", { reminderEnabled: true, reminderTime });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        setReminderEnabled(true);
        toast({ title: "Reminders enabled", description: "You'll be notified on your injection days." });
      } else {
        const sub = await getCurrentSubscription();
        if (sub) {
          await apiRequest("DELETE", "/api/push/unsubscribe", { endpoint: sub.endpoint });
          await unsubscribeFromPush();
        }
        setIsSubscribed(false);
        await apiRequest("PATCH", "/api/user/settings", { reminderEnabled: false });
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
        setReminderEnabled(false);
        toast({ title: "Reminders disabled" });
      }
    } catch {
      toast({ title: "Something went wrong", variant: "destructive" });
    }
    setPushBusy(false);
  };

  const handleSaveReminderTime = async () => {
    await apiRequest("PATCH", "/api/user/settings", { reminderTime });
    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    toast({ title: "Reminder time saved" });
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
                    <Select
                      value={field.value}
                      onValueChange={(newUnit) => {
                        const currentGoal = form.getValues("goalWeight");
                        const parsed = parseFloat(currentGoal);
                        if (!isNaN(parsed) && parsed > 0) {
                          const converted = newUnit === "kg"
                            ? Math.round(lbsToKg(parsed) * 10) / 10
                            : Math.round(kgToLbs(parsed) * 10) / 10;
                          form.setValue("goalWeight", String(converted));
                        }
                        field.onChange(newUnit);
                      }}
                    >
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

              <FormField
                control={form.control}
                name="heightCm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">
                      Height (cm) — for BMI
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="e.g. 175"
                        className="h-10"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="text-[10px] text-muted-foreground">
                Goal weight appears as a dashed target line on your analytics weight chart. Height is used to compute BMI on your dashboard.
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

      {/* Appearance Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
              <Sun size={13} className="text-primary" />
            </div>
            <span className="text-sm font-bold text-foreground">Appearance</span>
          </div>
          <Separator />
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: "light", label: "Light", Icon: Sun },
              { value: "dark", label: "Dark", Icon: Moon },
              { value: "system", label: "System", Icon: Monitor },
            ] as const).map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => handleThemeChange(value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                  theme === value
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Icon size={18} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Connected Devices Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-teal-50 rounded-lg flex items-center justify-center">
              <Smartphone size={13} className="text-teal-500" />
            </div>
            <span className="text-sm font-bold text-foreground">Connected Devices</span>
          </div>
          <Separator />

          {/* Withings */}
          {(() => {
            const status = deviceStatus?.withings;
            const isConnected = status?.connected ?? false;
            const isConfigured = status?.configured ?? false;
            return (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <span className="text-base font-bold text-blue-600">W</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Withings Scale</p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected
                      ? `Connected${status?.lastSync ? ` · synced ${new Date(status.lastSync).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}`
                      : !isConfigured ? "Setup required — add API keys" : "Sync weight from your smart scale"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isConnected && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleSyncDevice("withings")}
                        disabled={syncingDevice === "withings"}
                      >
                        <RotateCcw size={14} className={syncingDevice === "withings" ? "animate-spin" : ""} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDisconnectDevice("withings")}
                      >
                        <WifiOff size={14} />
                      </Button>
                    </>
                  )}
                  {!isConnected && isConfigured && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => window.location.href = "/api/integrations/withings/auth"}
                    >
                      <Wifi size={12} className="mr-1" />
                      Connect
                    </Button>
                  )}
                  {!isConfigured && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-lg">Not set up</span>
                  )}
                </div>
              </div>
            );
          })()}

          <Separator />

          {/* Oura Ring */}
          {(() => {
            const status = deviceStatus?.oura;
            const isConnected = status?.connected ?? false;
            const isConfigured = status?.configured ?? false;
            return (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                  <span className="text-base font-bold text-amber-600">O</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">Oura Ring</p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected
                      ? `Connected · sleep & readiness sync${status?.lastSync ? ` · ${new Date(status.lastSync).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}`
                      : !isConfigured ? "Setup required — add API keys" : "Sync sleep, readiness & HRV data"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isConnected && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleSyncDevice("oura")}
                        disabled={syncingDevice === "oura"}
                      >
                        <RotateCcw size={14} className={syncingDevice === "oura" ? "animate-spin" : ""} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDisconnectDevice("oura")}
                      >
                        <WifiOff size={14} />
                      </Button>
                    </>
                  )}
                  {!isConnected && isConfigured && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => window.location.href = "/api/integrations/oura/auth"}
                    >
                      <Wifi size={12} className="mr-1" />
                      Connect
                    </Button>
                  )}
                  {!isConfigured && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-lg">Not set up</span>
                  )}
                </div>
              </div>
            );
          })()}

          <p className="text-[10px] text-muted-foreground">
            To enable device sync, add your Withings / Oura API credentials as environment secrets (WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET, OURA_CLIENT_ID, OURA_CLIENT_SECRET).
          </p>
        </CardContent>
      </Card>

      {/* Reminders Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center">
              <Bell size={13} className="text-amber-500" />
            </div>
            <span className="text-sm font-bold text-foreground">Reminders</span>
          </div>
          <Separator />
          {!isPushSupported() ? (
            <p className="text-xs text-muted-foreground">
              Push notifications are not supported in this browser.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Shot-day reminders</p>
                  <p className="text-xs text-muted-foreground">
                    Get notified on your injection day
                  </p>
                </div>
                <Switch
                  checked={reminderEnabled}
                  onCheckedChange={handleToggleReminder}
                  disabled={pushBusy || !user?.glp1InjectionDay}
                />
              </div>
              {!user?.glp1InjectionDay && (
                <p className="text-xs text-amber-600">Set an injection day in the medication card first.</p>
              )}
              {reminderEnabled && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Reminder time</p>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-5 h-10 px-3"
                    onClick={handleSaveReminderTime}
                  >
                    <Check size={14} />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Redo Setup */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center">
              <RefreshCw size={13} className="text-muted-foreground" />
            </div>
            <span className="text-sm font-bold text-foreground">Setup</span>
          </div>
          <Separator className="mb-3" />
          <Button
            variant="outline"
            className="w-full h-10 text-sm"
            onClick={() => setShowOnboarding(true)}
          >
            <RefreshCw size={14} className="mr-2" />
            Redo onboarding wizard
          </Button>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-muted rounded-lg flex items-center justify-center">
              <LogOut size={13} className="text-muted-foreground" />
            </div>
            <span className="text-sm font-bold text-foreground">Account</span>
          </div>
          <Separator className="mb-3" />
          <Button
            variant="outline"
            className="w-full h-10 text-sm"
            onClick={async () => {
              try {
                await apiRequest("POST", "/api/auth/logout");
              } finally {
                // Full reload so nothing from this account stays in memory.
                window.location.assign("/");
              }
            }}
            data-testid="button-sign-out"
          >
            <LogOut size={14} className="mr-2" />
            Sign out
          </Button>
        </CardContent>
      </Card>

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

      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => {
            setShowOnboarding(false);
            queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          }}
        />
      )}
    </div>
  );
}
