import { useMemo } from "react";

interface ProgressChartProps {
  data: Array<{
    date: string;
    compliance: number;
  }>;
  className?: string;
}

export default function ProgressChart({ data, className = "" }: ProgressChartProps) {
  const chartData = useMemo(() => {
    return data.map(item => ({
      ...item,
      height: Math.max(4, (item.compliance / 100) * 48) // Min height of 4px, max 48px
    }));
  }, [data]);

  const averageCompliance = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.round(data.reduce((sum, item) => sum + item.compliance, 0) / data.length);
  }, [data]);

  return (
    <div className={`protocol-card ${className}`}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4">Weekly Progress</h3>
      
      <div className="flex items-end justify-between h-24 mb-4">
        {chartData.map((item, index) => (
          <div key={index} className="flex flex-col items-center space-y-2">
            <div className="w-6 bg-primary/20 h-12 rounded-t flex items-end">
              <div 
                className="w-6 bg-primary rounded-t transition-all duration-300"
                style={{ height: `${item.height}px` }}
              />
            </div>
            <span className="text-xs text-gray-600">
              {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' })}
            </span>
          </div>
        ))}
      </div>
      
      <div className="text-center">
        <span className="text-2xl font-bold text-primary">{averageCompliance}%</span>
        <span className="text-sm text-gray-600 ml-2">Average Compliance</span>
      </div>
    </div>
  );
}
