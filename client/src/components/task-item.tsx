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
}

export default function TaskItem({ task, protocolItem, onToggle }: TaskItemProps) {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async () => {
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
          disabled={isToggling}
          className="w-6 h-6"
        />
        <div>
          <div className="text-sm font-medium text-slate-800">
            {protocolItem.name}
          </div>
          <div className="text-xs text-gray-600 flex items-center space-x-1">
            <Clock size={12} />
            <span>{formatTime(protocolItem.timing)}</span>
            {protocolItem.dosage && <span>• {protocolItem.dosage}</span>}
          </div>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {task.completed ? (
          <CheckCircle className="text-success" size={16} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggle}
            disabled={isToggling}
            className="text-xs task-pending px-3 py-1 rounded-full"
          >
            {isToggling ? "..." : "Mark"}
          </Button>
        )}
      </div>
    </div>
  );
}
