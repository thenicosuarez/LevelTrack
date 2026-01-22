import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Heart, Brain, Activity, Flame, Shield, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Protocol, Task } from "@shared/schema";

interface HorsemanData {
  name: string;
  icon: typeof Heart;
  color: string;
  bgColor: string;
  description: string;
  protocolCategories: string[];
  protectionScore: number;
}

const horsemanMappings: Record<string, string[]> = {
  "Metabolic Syndrome": ["fasting", "nutrition"],
  "Cardiovascular Disease": ["exercise", "nutrition"],
  "Cancer": ["supplements", "nutrition", "exercise", "fasting"],
  "Neurocognitive Decline": ["exercise", "supplements"],
};

export default function FourHorsemenCard() {
  const { data: protocols = [] } = useQuery<Protocol[]>({
    queryKey: ['/api/protocols'],
  });

  const { data: complianceData } = useQuery<Record<number, { l30d: number }>>({
    queryKey: ['/api/protocols/compliance', 30],
  });

  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const activeProtocols = protocols.filter(p => p.isActive);

  const calculateHorsemanScore = (categories: string[]): number => {
    const relevantProtocols = activeProtocols.filter(p => 
      categories.includes(p.category)
    );
    
    if (relevantProtocols.length === 0) return 0;
    
    if (complianceData) {
      const scores = relevantProtocols.map(p => complianceData[p.id]?.l30d || 0);
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    
    return 50;
  };

  const horsemen: HorsemanData[] = [
    {
      name: "Metabolic",
      icon: Flame,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      description: "Metabolic Syndrome - Addressed by CR, DR & TR protocols",
      protocolCategories: horsemanMappings["Metabolic Syndrome"],
      protectionScore: calculateHorsemanScore(horsemanMappings["Metabolic Syndrome"]),
    },
    {
      name: "Cardio",
      icon: Heart,
      color: "text-red-600",
      bgColor: "bg-red-100",
      description: "Cardiovascular Disease - Addressed by Exercise & Nutrition",
      protocolCategories: horsemanMappings["Cardiovascular Disease"],
      protectionScore: calculateHorsemanScore(horsemanMappings["Cardiovascular Disease"]),
    },
    {
      name: "Cancer",
      icon: Shield,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "Cancer Prevention - Addressed by all metabolic protocols",
      protocolCategories: horsemanMappings["Cancer"],
      protectionScore: calculateHorsemanScore(horsemanMappings["Cancer"]),
    },
    {
      name: "Neuro",
      icon: Brain,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description: "Neurocognitive Decline - Addressed by Exercise & Supplements",
      protocolCategories: horsemanMappings["Neurocognitive Decline"],
      protectionScore: calculateHorsemanScore(horsemanMappings["Neurocognitive Decline"]),
    },
  ];

  const overallProtection = Math.round(
    horsemen.reduce((sum, h) => sum + h.protectionScore, 0) / horsemen.length
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-primary";
    if (score >= 40) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Strong";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    if (score > 0) return "Low";
    return "None";
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 gradient-outlive rounded-lg flex items-center justify-center">
              <Activity className="text-primary" size={16} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-800">The 4 Horsemen</h3>
              <p className="text-xs text-gray-500">Protection from major disease drivers</p>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="text-gray-400" size={16} />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Based on Peter Attia's "Outlive" framework. These are the 4 major diseases 
                  that account for most chronic illness. Your protocols help protect against them.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="text-center mb-6 p-4 bg-gradient-to-r from-primary/5 to-accent/5 rounded-xl">
          <div className={`text-4xl font-bold ${getScoreColor(overallProtection)}`}>
            {overallProtection}%
          </div>
          <div className="text-sm text-gray-600 mt-1">
            Overall Protection Level ({getScoreLabel(overallProtection)})
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {horsemen.map((horseman) => {
            const Icon = horseman.icon;
            const relevantProtocolCount = activeProtocols.filter(p => 
              horseman.protocolCategories.includes(p.category)
            ).length;
            
            return (
              <TooltipProvider key={horseman.name}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-4 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer">
                      <div className="flex items-center space-x-2 mb-2">
                        <div className={`w-8 h-8 ${horseman.bgColor} rounded-lg flex items-center justify-center`}>
                          <Icon className={horseman.color} size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-800">{horseman.name}</div>
                          <div className="text-xs text-gray-500">{relevantProtocolCount} protocols</div>
                        </div>
                      </div>
                      
                      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                            horseman.protectionScore >= 80 ? 'bg-green-500' :
                            horseman.protectionScore >= 60 ? 'bg-primary' :
                            horseman.protectionScore >= 40 ? 'bg-amber-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${horseman.protectionScore}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className={`text-xs font-medium ${getScoreColor(horseman.protectionScore)}`}>
                          {horseman.protectionScore}%
                        </span>
                        <span className="text-xs text-gray-400">
                          {getScoreLabel(horseman.protectionScore)}
                        </span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-sm font-medium mb-1">{horseman.description}</p>
                    <p className="text-xs text-gray-400">
                      Categories: {horseman.protocolCategories.map(c => {
                        const labels: Record<string, string> = {
                          supplements: "Supps & Rx",
                          exercise: "Exercise & Behavior",
                          fasting: "TR & IF: Meal Window",
                          nutrition: "CR & DR: Calories & Diet",
                        };
                        return labels[c] || c;
                      }).join(", ")}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-primary/5 rounded-lg">
          <div className="text-xs text-primary">
            <span className="font-medium">Outlive Insight:</span> Complete your daily protocols 
            to build consistent protection against the 4 Horsemen.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
