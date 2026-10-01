import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Moon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { HealthMetric } from "@shared/schema";
import { formatDate } from "@/lib/date-utils";

interface SleepTrendsProps {
  days?: number;
}

export default function SleepTrends({ days = 30 }: SleepTrendsProps) {
  const { data: healthMetrics = [] } = useQuery<HealthMetric[]>({
    queryKey: ['/api/health-metrics/range', { days }],
    queryFn: async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      const response = await fetch(
        `/api/health-metrics/range?startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`
      );
      return response.json();
    },
  });

  const sleepData = healthMetrics
    .filter(m => m.sleepHours !== null && m.sleepHours !== undefined)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const avgSleep = sleepData.length > 0
    ? (sleepData.reduce((sum, m) => sum + (m.sleepHours || 0), 0) / sleepData.length).toFixed(1)
    : "0";

  const recentWeek = sleepData.slice(-7);
  const previousWeek = sleepData.slice(-14, -7);
  
  const recentAvg = recentWeek.length > 0
    ? recentWeek.reduce((sum, m) => sum + (m.sleepHours || 0), 0) / recentWeek.length
    : 0;
  const previousAvg = previousWeek.length > 0
    ? previousWeek.reduce((sum, m) => sum + (m.sleepHours || 0), 0) / previousWeek.length
    : 0;
  
  const trend = recentAvg - previousAvg;
  const TrendIcon = trend > 0.2 ? TrendingUp : trend < -0.2 ? TrendingDown : Minus;
  const trendColor = trend > 0.2 ? "text-green-500" : trend < -0.2 ? "text-red-500" : "text-gray-500";

  const maxSleep = Math.max(...sleepData.map(d => d.sleepHours || 0), 10);
  const chartHeight = 80;

  const last14Days = sleepData.slice(-14);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Moon className="text-indigo-600" size={16} />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">Sleep Trends</h3>
          </div>
          <div className="flex items-center space-x-1">
            <TrendIcon className={trendColor} size={16} />
            <span className={`text-sm font-medium ${trendColor}`}>
              {Math.abs(trend).toFixed(1)}h
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-primary">{avgSleep}h</div>
            <div className="text-xs text-gray-600">{days}D Average</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-indigo-600">
              {recentWeek.length > 0 
                ? Math.max(...recentWeek.map(d => d.sleepHours || 0)) 
                : 0}h
            </div>
            <div className="text-xs text-gray-600">Best (7D)</div>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-amber-600">
              {recentWeek.length > 0 
                ? Math.min(...recentWeek.filter(d => d.sleepHours).map(d => d.sleepHours || 0)) 
                : 0}h
            </div>
            <div className="text-xs text-gray-600">Lowest (7D)</div>
          </div>
        </div>

        <div className="relative">
          <div className="absolute left-0 top-0 text-xs text-gray-400">{maxSleep}h</div>
          <div className="absolute left-0 bottom-0 text-xs text-gray-400">0h</div>
          
          <div className="ml-8 flex items-end space-x-1" style={{ height: chartHeight }}>
            {last14Days.length > 0 ? (
              last14Days.map((metric, index) => {
                const height = ((metric.sleepHours || 0) / maxSleep) * chartHeight;
                const isOptimal = (metric.sleepHours || 0) >= 7;
                return (
                  <div
                    key={metric.id || index}
                    className="flex-1 group relative"
                    style={{ height: chartHeight }}
                  >
                    <div
                      className={`absolute bottom-0 w-full rounded-t ${
                        isOptimal ? 'bg-primary' : 'bg-amber-400'
                      } transition-all hover:opacity-80`}
                      style={{ height: `${height}px` }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                      {metric.sleepHours}h - {new Date(metric.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                No sleep data recorded yet
              </div>
            )}
          </div>
          
          <div className="ml-8 mt-2 flex justify-between text-xs text-gray-400">
            <span>14 days ago</span>
            <span>Today</span>
          </div>
        </div>

        <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
          <div className="text-xs text-indigo-700">
            <span className="font-medium">Peter Attia's Sleep Target:</span> 7-9 hours for optimal healthspan
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
