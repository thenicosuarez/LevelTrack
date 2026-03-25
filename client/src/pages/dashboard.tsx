import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Syringe, CheckCircle2, Circle, TrendingDown, Flame, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/date-utils";
import { formatWeight, convertWeight } from "@/lib/weight-utils";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import type { User, Task, ProtocolItem, Protocol } from "@shared/schema";

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

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const today = formatDate(new Date());

  const { data: user } = useQuery<User>({ queryKey: ['/api/user'] });

  const { data: dashboardData, isLoading } = useQuery<DashboardData>({
    queryKey: ['/api/analytics/dashboard'],
  });

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

  const generateTasksMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiRequest("POST", "/api/tasks/generate", { date });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });

  useEffect(() => {
    generateTasksMutation.mutate(today);
  }, []);

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, { completed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update task", variant: "destructive" });
    },
  });

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const weightUnit = user?.weightUnit ?? "lbs";

  return (
    <div className="px-4 py-5 space-y-5">

      {/* Hero Card */}
      <div className="gradient-primary rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm opacity-80">{getGreeting()},</p>
            <h2 className="text-2xl font-bold mt-0.5">{user?.name || "there"}</h2>
            <p className="text-sm opacity-75 mt-1">Track your protocol, stay on level.</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{user?.streak || 0}</div>
            <div className="text-xs opacity-80 flex items-center justify-end gap-1">
              <Flame size={12} />
              Day Streak
            </div>
          </div>
        </div>

        {/* Today's shot status */}
        <div className="mt-4 bg-white/15 rounded-xl p-3 flex items-center justify-between">
          {dashboardData?.todayShotLogged ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-300" />
              <div>
                <p className="text-sm font-semibold">Shot logged today</p>
                <p className="text-xs opacity-80">
                  {dashboardData.todayShot?.drugName} {dashboardData.todayShot?.doseAmount}{dashboardData.todayShot?.doseUnit}
                  {dashboardData.todayShot?.injectionSite
                    ? ` · ${dashboardData.todayShot.injectionSite.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Circle size={18} className="opacity-60" />
              <div>
                <p className="text-sm font-semibold">No shot logged yet</p>
                <p className="text-xs opacity-75">
                  {dashboardData?.latestShot
                    ? `Last: ${dashboardData.latestShot.drugName} on ${dashboardData.latestShot.date}`
                    : "Log your first shot to get started"}
                </p>
              </div>
            </div>
          )}
          <Button
            size="sm"
            className="bg-white text-primary hover:bg-white/90 font-semibold text-xs h-8 px-3 rounded-lg shrink-0"
            onClick={() => setLocation("/log-shot")}
          >
            {dashboardData?.todayShotLogged ? "Edit" : "Log Shot"}
          </Button>
        </div>
      </div>

      {/* Key Stats Row — tappable to analytics */}
      <div className="grid grid-cols-3 gap-3">
        <Card
          className="cursor-pointer active:scale-95 transition-transform"
          onClick={() => setLocation("/analytics")}
        >
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-primary">
              {dashboardData?.glp1Adherence ?? 0}%
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">Adherence</div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer active:scale-95 transition-transform"
          onClick={() => setLocation("/analytics")}
        >
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-secondary">
              {formatWeight(dashboardData?.latestWeight ?? null, weightUnit)}
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">Current wt.</div>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer active:scale-95 transition-transform"
          onClick={() => setLocation("/analytics")}
        >
          <CardContent className="p-3 text-center">
            <div className={`text-xl font-bold ${
              dashboardData?.totalWeightLost && dashboardData.totalWeightLost > 0
                ? "text-green-600"
                : "text-muted-foreground"
            }`}>
              {dashboardData?.totalWeightLost && dashboardData.totalWeightLost > 0
                ? `-${convertWeight(dashboardData.totalWeightLost, weightUnit)}`
                : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{weightUnit} lost</div>
          </CardContent>
        </Card>
      </div>

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
                        ? <CheckCircle2 size={20} className="text-success" />
                        : <Circle size={20} className="text-muted-foreground" />
                      }
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

      {/* Empty state */}
      {todayTasks.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-6 text-center">
            <AlertCircle size={32} className="mx-auto mb-2 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No stack items today</p>
            <p className="text-sm text-muted-foreground mt-1">Add supplements to your protocol to track them here</p>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-14 flex flex-col gap-1 border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
          onClick={() => setLocation("/log-shot")}
        >
          <Syringe size={18} />
          <span className="text-xs font-medium">Log Shot</span>
        </Button>
        <Button
          variant="outline"
          className="h-14 flex flex-col gap-1 border-secondary/20 bg-secondary/5 text-secondary hover:bg-secondary/10"
          onClick={() => setLocation("/progress")}
        >
          <TrendingDown size={18} />
          <span className="text-xs font-medium">View Progress</span>
        </Button>
      </div>

    </div>
  );
}
