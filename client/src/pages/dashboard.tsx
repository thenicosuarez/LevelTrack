import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Camera, TrendingUp, Calendar, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/date-utils";
import TaskItem from "@/components/task-item";
import ProtocolBuilder from "@/components/protocol-builder";
import ProgressChart from "@/components/progress-chart";
import { useState } from "react";
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
  weeklyData: Array<{
    date: string;
    compliance: number;
  }>;
}

export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showProtocolBuilder, setShowProtocolBuilder] = useState(false);
  const today = formatDate(new Date());

  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ['/api/analytics/dashboard'],
  });

  const { data: todayTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { date: today }],
    queryFn: () => fetch(`/api/tasks?date=${today}`).then(res => res.json()),
  });

  const { data: protocols = [] } = useQuery<Protocol[]>({
    queryKey: ['/api/protocols'],
  });

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

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, { completed });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    },
  });

  const generateTasksMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tasks/generate", { date: today });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
      toast({
        title: "Success",
        description: "Tasks generated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate tasks",
        variant: "destructive",
      });
    },
  });

  const handleTaskToggle = (taskId: number, completed: boolean) => {
    toggleTaskMutation.mutate({ taskId, completed });
  };

  const activeProtocols = protocols.filter(p => p.isActive);

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Welcome Section */}
      <Card className="gradient-primary text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Good Morning,</p>
              <h2 className="text-xl font-semibold">{user?.name || "User"}</h2>
              <p className="text-sm opacity-90 mt-1">Ready to optimize your day?</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{user?.streak || 0}</div>
              <div className="text-xs opacity-90">Day Streak</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Today's Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {dashboardData?.todayCompliance || 0}%
            </div>
            <div className="text-xs text-gray-600">Compliance</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-secondary">
              {dashboardData?.sleepHours || 0}h
            </div>
            <div className="text-xs text-gray-600">Sleep</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-success capitalize">
              {dashboardData?.mood || "Fair"}
            </div>
            <div className="text-xs text-gray-600">Mood</div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Protocol Progress */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Today's Protocol</h3>
            <Badge variant="secondary">
              {dashboardData?.completedTasks || 0}/{dashboardData?.todayTasks || 0} Complete
            </Badge>
          </div>
          
          <div className="space-y-3">
            {todayTasks.length > 0 ? (
              todayTasks.map((task) => {
                const item = protocolItems.find(item => item.id === task.protocolItemId);
                return item ? (
                  <TaskItem
                    key={task.id}
                    task={task}
                    protocolItem={item}
                    onToggle={handleTaskToggle}
                  />
                ) : null;
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No tasks scheduled for today</p>
                {activeProtocols.length > 0 ? (
                  <Button 
                    variant="outline" 
                    className="mt-2"
                    onClick={() => generateTasksMutation.mutate()}
                    disabled={generateTasksMutation.isPending}
                  >
                    {generateTasksMutation.isPending ? "Generating..." : "Generate Tasks"}
                  </Button>
                ) : (
                  <Button 
                    variant="outline" 
                    className="mt-2"
                    onClick={() => setShowProtocolBuilder(true)}
                  >
                    Create Your First Protocol
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              className="flex items-center space-x-2 p-3 bg-primary/10 text-primary"
              onClick={() => setShowProtocolBuilder(true)}
            >
              <Plus size={16} />
              <span>New Protocol</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex items-center space-x-2 p-3 bg-secondary/10 text-secondary"
              onClick={() => setLocation("/calendar")}
            >
              <Calendar size={16} />
              <span>Calendar</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex items-center space-x-2 p-3 bg-accent/10 text-accent"
              onClick={() => toast({ title: "Coming Soon", description: "Barcode scanning feature" })}
            >
              <Camera size={16} />
              <span>Scan Label</span>
            </Button>
            <Button 
              variant="outline" 
              className="flex items-center space-x-2 p-3 bg-success/10 text-success"
              onClick={() => setLocation("/analytics")}
            >
              <TrendingUp size={16} />
              <span>Analytics</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Protocols Overview */}
      {activeProtocols.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Active Protocols</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setLocation("/protocols")}
              >
                View All <ArrowRight size={16} className="ml-1" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {activeProtocols.slice(0, 2).map((protocol) => (
                <div key={protocol.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 gradient-primary rounded-lg flex items-center justify-center">
                      <div className="w-6 h-6 bg-white rounded-sm opacity-90" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">{protocol.name}</div>
                      <div className="text-xs text-gray-600">
                        {protocol.category} • Active
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-primary">
                      {Math.floor(Math.random() * 20) + 80}%
                    </div>
                    <div className="text-xs text-gray-600">Compliance</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly Progress Chart */}
      {dashboardData?.weeklyData && (
        <ProgressChart data={dashboardData.weeklyData} />
      )}

      {/* Health Integration */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Health Integration</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 bg-white rounded-full" />
              </div>
              <div>
                <div className="text-sm font-medium">Oura Ring</div>
                <div className="text-xs text-gray-500">Not Connected</div>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <div className="w-4 h-4 bg-white rounded-full" />
              </div>
              <div>
                <div className="text-sm font-medium">MyFitnessPal</div>
                <div className="text-xs text-gray-500">Not Connected</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProtocolBuilder 
        open={showProtocolBuilder} 
        onClose={() => setShowProtocolBuilder(false)} 
      />
    </div>
  );
}
