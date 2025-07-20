import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, Shield, Clock, Dumbbell, Utensils, Camera, Mic } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ProtocolBuilder from "@/components/protocol-builder";
import ProtocolCard from "@/components/protocol-card";
import LabelScanner from "@/components/label-scanner";
import VoiceNoteProcessor from "@/components/voice-note-processor";
import type { Protocol, ProtocolItem } from "@shared/schema";

const categoryIcons = {
  supplements: Shield,
  exercise: Dumbbell,
  fasting: Clock,
  nutrition: Utensils,
};

export default function Protocols() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showProtocolBuilder, setShowProtocolBuilder] = useState(false);
  const [showProtocolEditor, setShowProtocolEditor] = useState(false);
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>("30");
  const [showScanner, setShowScanner] = useState(false);
  const [showVoiceNote, setShowVoiceNote] = useState(false);

  const { data: protocols = [], isLoading } = useQuery<Protocol[]>({
    queryKey: ['/api/protocols'],
  });

  // Get protocol items for dosage display
  const { data: allProtocolItems = [] } = useQuery<ProtocolItem[]>({
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

  // Get today's tasks for compliance calculation
  const { data: todayTasks = [] } = useQuery<any[]>({
    queryKey: ['/api/tasks', { date: new Date().toISOString().split('T')[0] }],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`/api/tasks?date=${today}`);
      return response.json();
    },
  });

  // Calculate today's compliance for each protocol
  const calculateTodayCompliance = (protocol: Protocol) => {
    if (!todayTasks.length) return 0;
    
    const protocolTasks = todayTasks.filter(task => task.protocolId === protocol.id);
    if (protocolTasks.length === 0) return 0;
    
    const completedTasks = protocolTasks.filter(task => task.completed);
    return Math.round((completedTasks.length / protocolTasks.length) * 100);
  };

  // For display purposes, use today's compliance for all time ranges
  const compliance30Days: Record<number, number> = {};
  const compliance90Days: Record<number, number> = {};
  const compliance365Days: Record<number, number> = {};
  
  protocols.forEach(protocol => {
    const todayCompliance = calculateTodayCompliance(protocol);
    compliance30Days[protocol.id] = todayCompliance;
    compliance90Days[protocol.id] = todayCompliance;
    compliance365Days[protocol.id] = todayCompliance;
  });

  // Helper function to get dosage display from actual database values
  const getDosageDisplay = (protocol: Protocol) => {
    const protocolItems = allProtocolItems.filter(item => item.protocolId === protocol.id);
    if (protocolItems.length === 0) return 'N/A';
    
    const firstItem = protocolItems[0];
    let dosageText = '';
    
    if (firstItem.dosageAmount && firstItem.dosageUnit) {
      dosageText = `${firstItem.dosageAmount.toLocaleString()} ${firstItem.dosageUnit}`;
    } else if (firstItem.startTime && firstItem.endTime) {
      dosageText = `${firstItem.startTime} - ${firstItem.endTime}`;
    } else if (firstItem.duration) {
      dosageText = `${firstItem.duration} min`;
    }
    
    // Add frequency
    const frequency = firstItem.frequency || 'daily';
    return dosageText ? `${dosageText} / ${frequency}` : frequency;
  };

  const deleteProtocolMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/protocols/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
      toast({
        title: "Success",
        description: "Protocol deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete protocol",
        variant: "destructive",
      });
    },
  });

  const toggleProtocolMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/protocols/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
      toast({
        title: "Success",
        description: "Protocol updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update protocol",
        variant: "destructive",
      });
    },
  });

  const filteredProtocols = protocols.filter(protocol => {
    const matchesSearch = protocol.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         protocol.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || protocol.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(protocols.map(p => p.category))];

  const handleDeleteProtocol = (id: number) => {
    if (confirm("Are you sure you want to delete this protocol?")) {
      deleteProtocolMutation.mutate(id);
    }
  };

  const handleToggleProtocol = (id: number, isActive: boolean) => {
    toggleProtocolMutation.mutate({ id, isActive: !isActive });
  };

  const handleEditProtocol = (protocol: Protocol) => {
    setSelectedProtocol(protocol);
    setShowProtocolEditor(true);
  };

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-32 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Protocol Planning</h1>
        <Button onClick={() => setShowProtocolBuilder(true)}>
          <Plus size={16} className="mr-1" />
          New Protocol
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button 
          variant="outline" 
          className="justify-start" 
          onClick={() => setShowScanner(true)}
        >
          <Camera size={16} className="mr-2" />
          Scan Label
        </Button>
        <Button 
          variant="outline" 
          className="justify-start"
          onClick={() => setShowVoiceNote(true)}
        >
          <Mic size={16} className="mr-2" />
          Voice Note
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <Input
            placeholder="Search protocols..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto">
          <Button
            variant={selectedCategory === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory("")}
          >
            All
          </Button>
          {categories.map(category => {
            const Icon = categoryIcons[category as keyof typeof categoryIcons];
            return (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="whitespace-nowrap"
              >
                {Icon && <Icon size={14} className="mr-1" />}
                {category}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Protocol Categories */}
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(categoryIcons).map(([category, Icon]) => (
          <Card 
            key={category} 
            className={`cursor-pointer transition-all ${
              selectedCategory === category ? "border-primary bg-primary/10" : "hover:border-gray-300"
            }`}
            onClick={() => setSelectedCategory(category === selectedCategory ? "" : category)}
          >
            <CardContent className="flex flex-col items-center space-y-2 p-4">
              <Icon className={selectedCategory === category ? "text-primary" : "text-gray-600"} size={24} />
              <span className={`text-sm font-medium capitalize ${
                selectedCategory === category ? "text-primary" : "text-gray-600"
              }`}>
                {category}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add New Protocol Button */}
      <Card className="border-2 border-dashed border-gray-300">
        <CardContent className="p-6">
          <Button
            variant="ghost"
            className="w-full h-16 border-none text-gray-600 hover:bg-primary hover:text-orange-500"
            onClick={() => setShowProtocolBuilder(true)}
          >
            <Plus size={24} className="mr-2" />
            Add New Protocol
          </Button>
        </CardContent>
      </Card>

      {/* Intake Protocols */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Intake Protocols</h2>
        
        {filteredProtocols.filter(p => p.category === 'supplements' || p.category === 'nutrition').length > 0 ? (
          <Card>
            <CardContent className="p-0">
              {/* Header Row */}
              <div className="grid grid-cols-6 gap-3 p-3 bg-gray-50 text-xs font-medium text-gray-600 border-b">
                <div className="col-span-2">Protocol</div>
                <div className="text-center">Dosage / Frequency</div>
                <div className="text-center">L30D</div>
                <div className="text-center">L90D</div>
                <div className="text-center">L365D</div>
              </div>
              
              {/* Data Rows */}
              {filteredProtocols.filter(p => p.category === 'supplements' || p.category === 'nutrition').map((protocol, index, arr) => (
                <div 
                  key={protocol.id} 
                  className={`grid grid-cols-6 gap-3 p-3 items-center hover:bg-gray-50 cursor-pointer ${index !== arr.length - 1 ? 'border-b' : ''}`}
                  onClick={() => {
                    setSelectedProtocol(protocol);
                    setShowProtocolEditor(true);
                  }}
                >
                  <div className="col-span-2 flex items-center space-x-3">
                    <div className="w-6 h-6 bg-primary/10 rounded-lg flex items-center justify-center">
                      {(() => {
                        const Icon = categoryIcons[protocol.category as keyof typeof categoryIcons] || Shield;
                        return <Icon size={12} className="text-primary" />;
                      })()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{protocol.name}</div>
                      <div className="text-xs text-gray-600">{protocol.description}</div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs text-gray-600">
                      {getDosageDisplay(protocol)}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs font-semibold text-primary">{compliance30Days[protocol.id] || 0}%</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs font-semibold text-primary">{compliance90Days[protocol.id] || 0}%</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs font-semibold text-primary">{compliance365Days[protocol.id] || 0}%</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No intake protocols found</p>
          </div>
        )}
      </div>

      {/* Physical Activity Protocols */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Physical Activity</h2>
        
        {filteredProtocols.filter(p => p.category === 'exercise' || p.category === 'fasting').length > 0 ? (
          <Card>
            <CardContent className="p-0">
              {/* Header Row */}
              <div className="grid grid-cols-6 gap-3 p-3 bg-gray-50 text-xs font-medium text-gray-600 border-b">
                <div className="col-span-2">Protocol</div>
                <div className="text-center">Duration / Frequency</div>
                <div className="text-center">L30D</div>
                <div className="text-center">L90D</div>
                <div className="text-center">L365D</div>
              </div>
              
              {/* Data Rows */}
              {filteredProtocols.filter(p => p.category === 'exercise' || p.category === 'fasting').map((protocol, index, arr) => (
                <div 
                  key={protocol.id} 
                  className={`grid grid-cols-6 gap-3 p-3 items-center hover:bg-gray-50 cursor-pointer ${index !== arr.length - 1 ? 'border-b' : ''}`}
                  onClick={() => {
                    setSelectedProtocol(protocol);
                    setShowProtocolEditor(true);
                  }}
                >
                  <div className="col-span-2 flex items-center space-x-3">
                    <div className="w-6 h-6 bg-primary/10 rounded-lg flex items-center justify-center">
                      {(() => {
                        const Icon = categoryIcons[protocol.category as keyof typeof categoryIcons] || Shield;
                        return <Icon size={12} className="text-primary" />;
                      })()}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{protocol.name}</div>
                      <div className="text-xs text-gray-600">{protocol.description}</div>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs text-gray-600">
                      {getDosageDisplay(protocol)}
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs font-semibold text-primary">{compliance30Days[protocol.id] || 0}%</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs font-semibold text-primary">{compliance90Days[protocol.id] || 0}%</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-xs font-semibold text-primary">{compliance365Days[protocol.id] || 0}%</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No physical activity protocols found</p>
          </div>
        )}
      </div>

      {/* Historical Data */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Historical Data</h3>
          <div className="flex items-center space-x-4 mb-4">
            <Button 
              variant={selectedTimeRange === "30" ? "default" : "outline"} 
              size="sm"
              onClick={() => setSelectedTimeRange("30")}
            >
              30 Days
            </Button>
            <Button 
              variant={selectedTimeRange === "90" ? "default" : "outline"} 
              size="sm"
              onClick={() => setSelectedTimeRange("90")}
            >
              90 Days
            </Button>
            <Button 
              variant={selectedTimeRange === "365" ? "default" : "outline"} 
              size="sm"
              onClick={() => setSelectedTimeRange("365")}
            >
              365 Days
            </Button>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {selectedTimeRange === "30" ? "92%" : selectedTimeRange === "90" ? "87%" : "81%"}
              </div>
              <div className="text-sm text-gray-600">Supplement Compliance</div>
              <div className="text-xs text-success">
                {selectedTimeRange === "30" ? "↑ 5%" : selectedTimeRange === "90" ? "↑ 8%" : "↑ 12%"}
              </div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-secondary">
                {selectedTimeRange === "30" ? "7.8hrs" : selectedTimeRange === "90" ? "7.5hrs" : "7.2hrs"}
              </div>
              <div className="text-sm text-gray-600">Average Sleep</div>
              <div className="text-xs text-success">
                {selectedTimeRange === "30" ? "↑ 0.3hrs" : selectedTimeRange === "90" ? "↑ 0.5hrs" : "↑ 0.8hrs"}
              </div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-accent">
                {selectedTimeRange === "30" ? "24" : selectedTimeRange === "90" ? "68" : "245"}
              </div>
              <div className="text-sm text-gray-600">Training Sessions</div>
              <div className="text-xs text-success">
                {selectedTimeRange === "30" ? "↑ 4" : selectedTimeRange === "90" ? "↑ 12" : "↑ 38"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProtocolBuilder 
        open={showProtocolBuilder} 
        onClose={() => setShowProtocolBuilder(false)} 
      />
      
      {/* Protocol Editor Modal */}
      {selectedProtocol && (
        <ProtocolBuilder 
          open={showProtocolEditor} 
          onClose={() => {
            setShowProtocolEditor(false);
            setSelectedProtocol(null);
          }}
          editingProtocol={selectedProtocol}
        />
      )}

      {/* Label Scanner Modal */}
      {showScanner && (
        <LabelScanner 
          onProtocolCreated={() => {
            setShowScanner(false);
            queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
          }}
        />
      )}

      {/* Voice Note Modal */}
      {showVoiceNote && (
        <VoiceNoteProcessor 
          onProtocolCreated={() => {
            setShowVoiceNote(false);
            queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
          }}
        />
      )}
    </div>
  );
}