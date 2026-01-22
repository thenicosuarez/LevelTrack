import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Dumbbell, Clock, Utensils } from "lucide-react";
import type { Protocol } from "@shared/schema";

interface ProtocolCardProps {
  protocol: Protocol;
  compliance?: number;
  onEdit?: () => void;
  onDelete?: () => void;
}

const categoryIcons = {
  supplements: Shield,
  exercise: Dumbbell,
  fasting: Clock,
  nutrition: Utensils,
};

const categoryLabels: Record<string, string> = {
  supplements: "Supps & Rx",
  exercise: "Exercise & Behavior",
  fasting: "TR & IF: Meal Window",
  nutrition: "CR & DR: Calories & Diet",
};

const categoryColors = {
  supplements: "bg-primary/10 text-primary",
  exercise: "bg-accent/10 text-accent",
  fasting: "bg-secondary/10 text-secondary",
  nutrition: "bg-success/10 text-success",
};

export default function ProtocolCard({ protocol, compliance, onEdit, onDelete }: ProtocolCardProps) {
  const Icon = categoryIcons[protocol.category as keyof typeof categoryIcons] || Shield;
  const colorClass = categoryColors[protocol.category as keyof typeof categoryColors] || "bg-gray-100";

  return (
    <Card className="protocol-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
              <Icon size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">{protocol.name}</h3>
              <p className="text-sm text-gray-600">{protocol.description}</p>
            </div>
          </div>
          
          {compliance !== undefined && (
            <div className="text-right">
              <div className="text-lg font-bold text-primary">{compliance}%</div>
              <div className="text-xs text-gray-600">Compliance</div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Badge variant="outline" className="text-xs">
              {categoryLabels[protocol.category] || protocol.category}
            </Badge>
            {protocol.isActive && (
              <Badge variant="secondary" className="text-xs">
                Active
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {onEdit && (
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
