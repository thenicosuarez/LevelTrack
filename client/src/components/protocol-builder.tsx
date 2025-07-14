import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Shield, Clock, Dumbbell, Utensils } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InsertProtocol, InsertProtocolItem } from "@shared/schema";

interface ProtocolBuilderProps {
  open: boolean;
  onClose: () => void;
}

const categories = [
  { id: "supplements", label: "Supplements", icon: Shield },
  { id: "fasting", label: "Fasting", icon: Clock },
  { id: "exercise", label: "Exercise", icon: Dumbbell },
  { id: "nutrition", label: "Nutrition", icon: Utensils },
];

const goals = [
  "Immune Support",
  "Energy",
  "Sleep",
  "Performance",
  "Recovery",
  "Focus",
  "Stress Management",
  "Weight Management",
];

interface ProtocolItemForm {
  name: string;
  dosageAmount: string;
  dosageUnit: string;
  timing: string;
  frequency: string;
  instructions: string;
}

export default function ProtocolBuilder({ open, onClose }: ProtocolBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedCategory, setSelectedCategory] = useState("supplements");
  const [protocolName, setProtocolName] = useState("");
  const [protocolDescription, setProtocolDescription] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [protocolItems, setProtocolItems] = useState<ProtocolItemForm[]>([
    { name: "", dosageAmount: "", dosageUnit: "mg", timing: "08:00", frequency: "daily", instructions: "" }
  ]);

  const createProtocolMutation = useMutation({
    mutationFn: async (data: InsertProtocol) => {
      const response = await apiRequest("POST", "/api/protocols", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
      handleClose();
      toast({
        title: "Success",
        description: "Protocol created successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create protocol",
        variant: "destructive",
      });
    },
  });

  const createProtocolItemMutation = useMutation({
    mutationFn: async ({ protocolId, items }: { protocolId: number; items: ProtocolItemForm[] }) => {
      const promises = items.map((item, index) => 
        apiRequest("POST", `/api/protocols/${protocolId}/items`, {
          ...item,
          order: index
        })
      );
      return Promise.all(promises);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!protocolName.trim()) {
      toast({
        title: "Error",
        description: "Protocol name is required",
        variant: "destructive",
      });
      return;
    }

    const validItems = protocolItems.filter(item => item.name.trim());
    if (validItems.length === 0) {
      toast({
        title: "Error",
        description: "At least one protocol item is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const protocol = await createProtocolMutation.mutateAsync({
        name: protocolName,
        description: protocolDescription,
        category: selectedCategory,
        goals: selectedGoals,
        isActive: true,
        color: "#14B8A6",
        userId: 1, // This will be set by the backend
      });

      if (protocol.id) {
        await createProtocolItemMutation.mutateAsync({
          protocolId: protocol.id,
          items: validItems.map(item => ({
            ...item,
            dosageAmount: item.dosageAmount ? parseInt(item.dosageAmount) : null,
          }))
        });
      }
    } catch (error) {
      console.error("Error creating protocol:", error);
    }
  };

  const handleClose = () => {
    setProtocolName("");
    setProtocolDescription("");
    setSelectedGoals([]);
    setProtocolItems([
      { name: "", dosageAmount: "", dosageUnit: "mg", timing: "08:00", frequency: "daily", instructions: "" }
    ]);
    setSelectedCategory("supplements");
    onClose();
  };

  const addProtocolItem = () => {
    setProtocolItems([...protocolItems, 
      { name: "", dosageAmount: "", dosageUnit: "mg", timing: "08:00", frequency: "daily", instructions: "" }
    ]);
  };

  const removeProtocolItem = (index: number) => {
    setProtocolItems(protocolItems.filter((_, i) => i !== index));
  };

  const updateProtocolItem = (index: number, field: keyof ProtocolItemForm, value: string) => {
    const updated = [...protocolItems];
    updated[index][field] = value;
    setProtocolItems(updated);
  };

  const toggleGoal = (goal: string) => {
    setSelectedGoals(prev => 
      prev.includes(goal) 
        ? prev.filter(g => g !== goal)
        : [...prev, goal]
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Protocol</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category Selection */}
          <div className="grid grid-cols-2 gap-3">
            {categories.map(({ id, label, icon: Icon }) => (
              <Card 
                key={id} 
                className={`cursor-pointer transition-all ${
                  selectedCategory === id 
                    ? "border-primary bg-primary/10" 
                    : "border-gray-200 hover:border-gray-300"
                }`}
                onClick={() => setSelectedCategory(id)}
              >
                <CardContent className="flex flex-col items-center space-y-2 p-4">
                  <Icon className={selectedCategory === id ? "text-primary" : "text-gray-600"} size={24} />
                  <span className={`text-sm font-medium ${
                    selectedCategory === id ? "text-primary" : "text-gray-600"
                  }`}>
                    {label}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Protocol Details */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Protocol Name</Label>
              <Input
                id="name"
                placeholder="e.g., Morning Immune Stack"
                value={protocolName}
                onChange={(e) => setProtocolName(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this protocol..."
                value={protocolDescription}
                onChange={(e) => setProtocolDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Protocol Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addProtocolItem}>
                <Plus size={16} className="mr-1" />
                Add Item
              </Button>
            </div>

            {protocolItems.map((item, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Item {index + 1}</Label>
                    {protocolItems.length > 1 && (
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => removeProtocolItem(index)}
                      >
                        <Trash2 size={16} className="text-red-500" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`item-name-${index}`} className="text-xs">Name</Label>
                      <Input
                        id={`item-name-${index}`}
                        placeholder="Supplement name"
                        value={item.name}
                        onChange={(e) => updateProtocolItem(index, "name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`item-dosage-${index}`} className="text-xs">Dosage</Label>
                      <div className="flex space-x-2">
                        <Input
                          id={`item-dosage-${index}`}
                          placeholder="500"
                          type="number"
                          value={item.dosageAmount}
                          onChange={(e) => updateProtocolItem(index, "dosageAmount", e.target.value)}
                          className="flex-1"
                        />
                        <Select 
                          value={item.dosageUnit} 
                          onValueChange={(value) => updateProtocolItem(index, "dosageUnit", value)}
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mg">mg</SelectItem>
                            <SelectItem value="g">g</SelectItem>
                            <SelectItem value="mcg">mcg</SelectItem>
                            <SelectItem value="ml">ml</SelectItem>
                            <SelectItem value="oz">oz</SelectItem>
                            <SelectItem value="capsules">caps</SelectItem>
                            <SelectItem value="tablets">tabs</SelectItem>
                            <SelectItem value="drops">drops</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`item-timing-${index}`} className="text-xs">Time</Label>
                      <Input
                        id={`item-timing-${index}`}
                        type="time"
                        value={item.timing}
                        onChange={(e) => updateProtocolItem(index, "timing", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`item-frequency-${index}`} className="text-xs">Frequency</Label>
                      <Select 
                        value={item.frequency} 
                        onValueChange={(value) => updateProtocolItem(index, "frequency", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="as_needed">As Needed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Goals */}
          <div>
            <Label>Goals</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {goals.map((goal) => (
                <div key={goal} className="flex items-center space-x-2">
                  <Checkbox
                    id={goal}
                    checked={selectedGoals.includes(goal)}
                    onCheckedChange={() => toggleGoal(goal)}
                  />
                  <Label htmlFor={goal} className="text-sm">{goal}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={createProtocolMutation.isPending}
            >
              {createProtocolMutation.isPending ? "Creating..." : "Create Protocol"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
