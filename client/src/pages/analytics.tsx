import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Calendar, Target, Award, Clock } from "lucide-react";
import ProgressChart from "@/components/progress-chart";
import { getDateRange } from "@/lib/date-utils";
import type { Task, HealthMetric } from "@shared/schema";

interface AnalyticsData {
  todayCompliance: number;
  weekCompliance: number;
  monthCompliance: number;
  totalTasks: number;
  completedTasks: number;
  streak: number;
  weeklyData: Array<{
    date: string;
    compliance: number;
  }>;
}

export default function Analytics() {
  const { startDate, endDate } = getDateRange(30);

  const { data: analyticsData } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/dashboard'],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks/range', { startDate, endDate }],
    queryFn: () => fetch(`/api/tasks/range?startDate=${startDate}&endDate=${endDate}`).then(res => res.json()),
  });

  const { data: healthMetrics = [] } = useQuery<HealthMetric[]>({
    queryKey: ['/api/health-metrics/range', { startDate, endDate }],
    queryFn: () => fetch(`/api/health-metrics/range?startDate=${startDate}&endDate=${endDate}`).then(res => res.json()),
  });

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const overallCompliance = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const averageSleep = healthMetrics.length > 0 
    ? Math.round(healthMetrics.reduce((sum, m) => sum + (m.sleepHours || 0), 0) / healthMetrics.length * 10) / 10
    : 0;

  const mockData = {
    weeklyCompliance: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      compliance: Math.floor(Math.random() * 30) + 70
    })).reverse(),
    monthlyTrends: [
      { metric: "Compliance", value: overallCompliance, change: 5, trend: "up" },
      { metric: "Sleep Quality", value: averageSleep, change: 0.3, trend: "up" },
      { metric: "Energy Level", value: 7.2, change: -0.2, trend: "down" },
      { metric: "Mood Score", value: 8.1, change: 0.4, trend: "up" },
    ]
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Analytics</h1>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Calendar size={16} className="mr-1" />
            30 Days
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{overallCompliance}%</div>
            <div className="text-xs text-gray-600">Overall Compliance</div>
            <div className="text-xs text-success flex items-center justify-center mt-1">
              <TrendingUp size={10} className="mr-1" />
              +5%
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-secondary">{analyticsData?.streak || 0}</div>
            <div className="text-xs text-gray-600">Current Streak</div>
            <div className="text-xs text-success flex items-center justify-center mt-1">
              <Award size={10} className="mr-1" />
              Personal Best
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weekly Progress */}
      <ProgressChart data={mockData.weeklyCompliance} />

      {/* Key Metrics */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Key Metrics</h3>
          <div className="space-y-4">
            {mockData.monthlyTrends.map((metric, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Target size={16} className="text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">{metric.metric}</div>
                    <div className="text-sm text-gray-600">
                      {typeof metric.value === 'number' && metric.value % 1 === 0 
                        ? metric.value 
                        : typeof metric.value === 'number' 
                          ? metric.value.toFixed(1) 
                          : metric.value}
                      {metric.metric.includes('Compliance') && '%'}
                      {metric.metric.includes('Sleep') && 'hrs'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Badge variant={metric.trend === 'up' ? 'default' : 'secondary'} className="text-xs">
                    {metric.trend === 'up' ? (
                      <TrendingUp size={10} className="mr-1" />
                    ) : (
                      <TrendingDown size={10} className="mr-1" />
                    )}
                    {metric.change > 0 ? '+' : ''}{metric.change}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Category Performance</h3>
          <div className="space-y-3">
            {[
              { category: "Supps & Rx", compliance: 94, color: "bg-primary" },
              { category: "Exercise & Behavior", compliance: 87, color: "bg-accent" },
              { category: "TR & IF: Meal Window", compliance: 89, color: "bg-secondary" },
              { category: "CR & DR: Calories & Diet", compliance: 92, color: "bg-success" },
            ].map((item, index) => (
              <div key={index} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">{item.category}</span>
                  <span className="text-sm text-gray-600">{item.compliance}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${item.color}`}
                    style={{ width: `${item.compliance}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Time Analysis */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Time Analysis</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Clock size={24} className="mx-auto mb-2 text-primary" />
              <div className="text-lg font-bold text-primary">8:15 AM</div>
              <div className="text-sm text-gray-600">Best Performance Time</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Clock size={24} className="mx-auto mb-2 text-secondary" />
              <div className="text-lg font-bold text-secondary">15 min</div>
              <div className="text-sm text-gray-600">Avg Task Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Goals & Achievements */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Goals & Achievements</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-success/10 rounded-lg">
              <div className="flex items-center space-x-3">
                <Award className="text-success" size={20} />
                <div>
                  <div className="font-medium text-slate-800">7-Day Streak</div>
                  <div className="text-sm text-gray-600">Completed all daily tasks</div>
                </div>
              </div>
              <Badge variant="default" className="bg-success">
                Achieved
              </Badge>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg">
              <div className="flex items-center space-x-3">
                <Target className="text-primary" size={20} />
                <div>
                  <div className="font-medium text-slate-800">90% Compliance</div>
                  <div className="text-sm text-gray-600">Monthly target</div>
                </div>
              </div>
              <Badge variant="secondary">
                In Progress
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Export Data</h3>
          <div className="flex space-x-3">
            <Button variant="outline" className="flex-1">
              Export CSV
            </Button>
            <Button variant="outline" className="flex-1">
              Export JSON
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
