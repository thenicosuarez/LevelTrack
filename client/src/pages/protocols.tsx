import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, Shield, Clock, Dumbbell, Utensils } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ProtocolBuilder from "@/components/protocol-builder";
import ProtocolCard from "@/components/protocol-card";
import type { Protocol } from "@shared/schema";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const { data: protocols = [], isLoading } = useQuery<Protocol[]>({
    queryKey: ['/api/protocols'],
  });

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
            className="w-full h-16 border-none text-gray-600 hover:text-primary"
            onClick={() => setShowProtocolBuilder(true)}
          >
            <Plus size={24} className="mr-2" />
            Add New Protocol
          </Button>
        </CardContent>
      </Card>

      {/* Current Protocols */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Current Protocols</h2>
        
        {filteredProtocols.length > 0 ? (
          <div className="space-y-4">
            {filteredProtocols.map((protocol) => (
              <Card key={protocol.id} className="protocol-card">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        {(() => {
                          const Icon = categoryIcons[protocol.category as keyof typeof categoryIcons] || Shield;
                          return <Icon size={20} className="text-primary" />;
                        })()}
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-800">{protocol.name}</h3>
                        <p className="text-sm text-gray-600">{protocol.description}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">
                        {Math.floor(Math.random() * 20) + 80}%
                      </div>
                      <div className="text-xs text-gray-600">Compliance</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs capitalize">
                        {protocol.category}
                      </Badge>
                      <Badge 
                        variant={protocol.isActive ? "default" : "secondary"} 
                        className="text-xs"
                      >
                        {protocol.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {protocol.goals?.map((goal, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {goal}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleProtocol(protocol.id, protocol.isActive)}
                      >
                        {protocol.isActive ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteProtocol(protocol.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Shield size={48} className="mx-auto mb-4 text-gray-300" />
            <p>No protocols found</p>
            <Button 
              variant="outline" 
              className="mt-2"
              onClick={() => setShowProtocolBuilder(true)}
            >
              Create Your First Protocol
            </Button>
          </div>
        )}
      </div>

      {/* Historical Data */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Historical Data</h3>
          <div className="flex items-center space-x-4 mb-4">
            <Button variant="default" size="sm">30 Days</Button>
            <Button variant="outline" size="sm">90 Days</Button>
            <Button variant="outline" size="sm">365 Days</Button>
          </div>
          
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-primary">92%</div>
              <div className="text-sm text-gray-600">Supplement Compliance</div>
              <div className="text-xs text-success">↑ 5%</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-secondary">7.8hrs</div>
              <div className="text-sm text-gray-600">Average Sleep</div>
              <div className="text-xs text-success">↑ 0.3hrs</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-accent">24</div>
              <div className="text-sm text-gray-600">Training Sessions</div>
              <div className="text-xs text-success">↑ 4</div>
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
