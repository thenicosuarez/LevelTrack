import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Camera, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/date-utils";
import TaskItem from "@/components/task-item";
import ProtocolBuilder from "@/components/protocol-builder";
import VoiceNoteProcessor from "@/components/voice-note-processor";
import LabelScanner from "@/components/label-scanner";
import ProgressChart from "@/components/progress-chart";
import SleepTrends from "@/components/sleep-trends";
import FourHorsemenCard from "@/components/four-horsemen-card";
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
  const [showLabelScanner, setShowLabelScanner] = useState(false);
  const today = formatDate(new Date());

  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ['/api/analytics/dashboard'],
  });

  const { data: todayTasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { date: today }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?date=${today}`);
      return response.json();
    },
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

  // Auto-generate tasks for today
  const generateTasksMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiRequest("POST", "/api/tasks/generate", { date });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });

  // Generate tasks when dashboard loads
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    generateTasksMutation.mutate(today);
  }, []);

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, { 
        completed
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/protocols/compliance', 30] });
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



  const handleTaskToggle = (taskId: number, completed: boolean) => {
    toggleTaskMutation.mutate({ taskId, completed });
  };

  const activeProtocols = protocols.filter(p => p.isActive);

  // Calculate compliance client-side as fallback
  const calculateCompliance = (protocol: any) => {
    if (!todayTasks.length) return 0;
    
    const protocolTasks = todayTasks.filter(task => task.protocolId === protocol.id);
    if (protocolTasks.length === 0) return 0;
    
    const completedTasks = protocolTasks.filter(task => task.completed);
    return Math.round((completedTasks.length / protocolTasks.length) * 100);
  };

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
          
          {todayTasks.length > 0 ? (
            <div className="space-y-0 border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50 text-sm font-medium text-gray-600 border-b">
                <div className="col-span-1"></div>
                <div className="col-span-3">Item</div>
                <div className="col-span-2 text-center">Dosage</div>
                <div className="col-span-6">Description</div>
              </div>
              
              {/* Data Rows */}
              {todayTasks.map((task, index) => {
                const item = protocolItems.find(item => item.id === task.protocolItemId);
                return item ? (
                  <div key={task.id} className={`grid grid-cols-12 gap-2 p-3 items-center hover:bg-gray-50 ${index !== todayTasks.length - 1 ? 'border-b' : ''}`}>
                    <div className="col-span-1">
                      <input
                        type="checkbox"
                        checked={task.completed || false}
                        onChange={(e) => handleTaskToggle(task.id, e.target.checked)}
                        className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary focus:ring-2"
                      />
                    </div>
                    <div className="col-span-3">
                      <div className="font-medium text-sm">{item.name}</div>
                    </div>
                    <div className="col-span-2 text-center text-sm">
                      {item.dosageAmount ? `${item.dosageAmount}${item.dosageUnit}` : 'Daily'}
                    </div>
                    <div className="col-span-6 text-sm text-gray-600">
                      {item.instructions || 'Daily routine tracking'}
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No tasks scheduled for today</p>
              <Button 
                variant="outline" 
                className="mt-2"
                onClick={() => setShowProtocolBuilder(true)}
              >
                Create Your First Protocol
              </Button>
            </div>
          )}

          {/* Active Protocols within Today's Protocol */}
          {activeProtocols.length > 0 && (
            <div className="mt-6 pt-4 border-t">
              <h4 className="font-medium text-slate-700 mb-3">Last 30 Days Performance</h4>
              <div className="space-y-2">
                {activeProtocols.map((protocol) => (
                  <div key={protocol.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 gradient-primary rounded-lg flex items-center justify-center">
                        <div className="w-4 h-4 bg-white rounded-sm opacity-90" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{protocol.name}</div>
                        <div className="text-xs text-gray-600">
                          {protocol.category} • Active
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-primary">
                        {calculateCompliance(protocol)}%
                      </div>
                      <div className="text-xs text-gray-600">Today</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-3 gap-3">
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
              onClick={() => setShowLabelScanner(true)}
            >
              <Camera size={16} />
              <span>Scan Label</span>
            </Button>
          </div>
        </CardContent>
      </Card>



      {/* Voice Note Processor */}
      <VoiceNoteProcessor 
        onProtocolCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
          queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
        }}
      />

      {/* Label Scanner */}
      {showLabelScanner && (
        <LabelScanner 
          onProtocolCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
            queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
            setShowLabelScanner(false);
          }}
        />
      )}

      {/* 4 Horsemen Protection Summary */}
      <FourHorsemenCard />

      {/* Sleep Trends Visualization */}
      <SleepTrends days={30} />

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
