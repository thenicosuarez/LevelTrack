import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Heart, Brain, Activity, Flame, Shield, Info, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import type { Protocol } from "@shared/schema";

type ExtendedProtocol = Protocol;

interface HorsemanData {
  id: string;
  name: string;
  fullName: string;
  icon: typeof Heart;
  color: string;
  bgColor: string;
  description: string;
  protectionScore: number;
  linkedProtocols: ExtendedProtocol[];
}

const categoryLabels: Record<string, string> = {
  supplements: "Supps & Rx",
  exercise: "Exercise & Behavior",
  fasting: "TR & IF: Meal Window",
  nutrition: "CR & DR: Calories & Diet",
};

export default function FourHorsemenCard() {
  const [, setLocation] = useLocation();
  const [expandedHorseman, setExpandedHorseman] = useState<string | null>(null);

  const { data: protocols = [] } = useQuery<ExtendedProtocol[]>({
    queryKey: ['/api/protocols'],
  });

  const { data: complianceData } = useQuery<Record<number, { l30d: number }>>({
    queryKey: ['/api/protocols/compliance', 30],
  });

  const activeProtocols = protocols.filter(p => p.isActive);

  const getLinkedProtocols = (horsemanId: string): ExtendedProtocol[] => {
    return activeProtocols.filter(p => 
      (p.horsemenTags || []).includes(horsemanId)
    );
  };

  const calculateHorsemanScore = (horsemanId: string): number => {
    const relevantProtocols = getLinkedProtocols(horsemanId);
    
    if (relevantProtocols.length === 0) return 0;
    
    if (complianceData) {
      const scores = relevantProtocols.map(p => complianceData[p.id]?.l30d || 0);
      return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
    
    return 50;
  };

  const horsemen: HorsemanData[] = [
    {
      id: "metabolic",
      name: "Metabolic",
      fullName: "Metabolic Syndrome",
      icon: Flame,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
      description: "Type 2 diabetes, obesity, insulin resistance",
      protectionScore: calculateHorsemanScore("metabolic"),
      linkedProtocols: getLinkedProtocols("metabolic"),
    },
    {
      id: "cardiovascular",
      name: "Cardio",
      fullName: "Cardiovascular Disease",
      icon: Heart,
      color: "text-red-600",
      bgColor: "bg-red-100",
      description: "Heart disease, stroke, atherosclerosis",
      protectionScore: calculateHorsemanScore("cardiovascular"),
      linkedProtocols: getLinkedProtocols("cardiovascular"),
    },
    {
      id: "cancer",
      name: "Cancer",
      fullName: "Cancer Prevention",
      icon: Shield,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
      description: "Reduce cancer risk through metabolic health",
      protectionScore: calculateHorsemanScore("cancer"),
      linkedProtocols: getLinkedProtocols("cancer"),
    },
    {
      id: "neurocognitive",
      name: "Neuro",
      fullName: "Neurocognitive Decline",
      icon: Brain,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      description: "Alzheimer's, dementia, cognitive function",
      protectionScore: calculateHorsemanScore("neurocognitive"),
      linkedProtocols: getLinkedProtocols("neurocognitive"),
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

  const toggleExpanded = (horsemanId: string) => {
    setExpandedHorseman(expandedHorseman === horsemanId ? null : horsemanId);
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
                  Based on Peter Attia's "Outlive" framework. Tag your protocols with 
                  which diseases they help prevent to track your protection.
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

        <div className="space-y-2">
          {horsemen.map((horseman) => {
            const Icon = horseman.icon;
            const isExpanded = expandedHorseman === horseman.id;
            const hasProtocols = horseman.linkedProtocols.length > 0;
            
            return (
              <div key={horseman.id} className="rounded-xl overflow-hidden border border-gray-100">
                <div 
                  className={`p-4 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer ${
                    isExpanded ? 'bg-gray-100' : ''
                  }`}
                  onClick={() => toggleExpanded(horseman.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 ${horseman.bgColor} rounded-lg flex items-center justify-center`}>
                        <Icon className={horseman.color} size={20} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{horseman.fullName}</div>
                        <div className="text-xs text-gray-500">
                          {horseman.linkedProtocols.length} protocol{horseman.linkedProtocols.length !== 1 ? 's' : ''} linked
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <div className={`text-lg font-bold ${getScoreColor(horseman.protectionScore)}`}>
                          {horseman.protectionScore}%
                        </div>
                        <div className="text-xs text-gray-400">{getScoreLabel(horseman.protectionScore)}</div>
                      </div>
                      {hasProtocols ? (
                        isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />
                      ) : null}
                    </div>
                  </div>
                  
                  <div className="mt-2">
                    <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                          horseman.protectionScore >= 80 ? 'bg-green-500' :
                          horseman.protectionScore >= 60 ? 'bg-primary' :
                          horseman.protectionScore >= 40 ? 'bg-amber-500' :
                          horseman.protectionScore > 0 ? 'bg-red-500' : 'bg-gray-300'
                        }`}
                        style={{ width: `${Math.max(horseman.protectionScore, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {isExpanded && hasProtocols && (
                  <div className="bg-white border-t border-gray-100 p-3 space-y-2">
                    <div className="text-xs text-gray-500 mb-2">Linked Protocols:</div>
                    {horseman.linkedProtocols.map((protocol) => (
                      <div 
                        key={protocol.id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLocation('/protocols');
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <span className="text-sm font-medium text-slate-700">{protocol.name}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {categoryLabels[protocol.category] || protocol.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {isExpanded && !hasProtocols && (
                  <div className="bg-white border-t border-gray-100 p-4 text-center">
                    <p className="text-sm text-gray-500 mb-2">
                      No protocols tagged for {horseman.fullName} yet
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation('/protocols');
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Tag a protocol →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 p-3 bg-primary/5 rounded-lg">
          <div className="text-xs text-primary">
            <span className="font-medium">Tip:</span> Tag your protocols with disease categories 
            when creating them to see your protection levels here.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
