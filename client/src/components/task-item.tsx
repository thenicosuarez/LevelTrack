import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle } from "lucide-react";
import { formatTime } from "@/lib/date-utils";
import type { Task, ProtocolItem } from "@shared/schema";

interface TaskItemProps {
  task: Task;
  protocolItem: ProtocolItem;
  onToggle: (taskId: number, completed: boolean) => void;
  isFutureDate?: boolean;
}

export default function TaskItem({ task, protocolItem, onToggle, isFutureDate = false }: TaskItemProps) {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async () => {
    if (isFutureDate) return;
    setIsToggling(true);
    await onToggle(task.id, !task.completed);
    setIsToggling(false);
  };

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg ${
      task.completed ? "bg-success/10" : "bg-gray-50"
    }`}>
      <div className="flex items-center space-x-3">
        <Checkbox
          checked={task.completed}
          onCheckedChange={handleToggle}
          disabled={isToggling || isFutureDate}
          className={`w-6 h-6 ${isFutureDate ? 'opacity-50' : ''}`}
        />
        <div>
          <div className="text-sm font-medium text-slate-800">
            {protocolItem.name}
          </div>
          <div className="text-xs text-gray-600 flex items-center space-x-1">
            <Clock size={12} />
            <span>{formatTime(protocolItem.timing || 'morning')}</span>
            {protocolItem.dosageAmount && protocolItem.dosageUnit && (
              <span>• {protocolItem.dosageAmount} {protocolItem.dosageUnit}</span>
            )}
            {protocolItem.startTime && (
              <span>• {protocolItem.startTime} - {protocolItem.endTime || 'ongoing'}</span>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {isFutureDate && (
          <span className="text-xs text-gray-500">Future</span>
        )}
        {task.completed && (
          <CheckCircle className="text-success" size={16} />
        )}
      </div>
    </div>
  );
}
