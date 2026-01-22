import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Shield, Clock, Dumbbell, Utensils, Camera } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { InsertProtocol, InsertProtocolItem, Protocol } from "@shared/schema";

interface ProtocolBuilderProps {
  open: boolean;
  onClose: () => void;
  editingProtocol?: Protocol | null;
}

const categories = [
  { id: "supplements", label: "Supps & Rx", icon: Shield, group: "protocols" },
  { id: "exercise", label: "Exercise & Behavior", icon: Dumbbell, group: "protocols" },
  { id: "fasting", label: "TR & IF: Meal Window", icon: Clock, group: "levers" },
  { id: "nutrition", label: "CR & DR: Calories & Diet", icon: Utensils, group: "levers" },
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
  
  // Enhanced supplement/nutrition fields
  dosageAmount: string;
  dosageUnit: string;
  formFactor: string;
  
  // Cycling fields
  cyclingType: string;
  onCycleDays: string;
  offCycleDays: string;
  currentCyclePhase: string;
  cycleStartDate: string;
  cycleEndDate: string;
  trackingKpis: string[];
  
  // Fasting fields
  startTime: string;
  endTime: string;
  fastingType: string;
  
  // Exercise fields
  sets: string;
  reps: string;
  duration: string;
  restTime: string;
  weight: string;
  
  // General fields
  timing: string;
  frequency: string;
  instructions: string;
}

export default function ProtocolBuilder({ open, onClose, editingProtocol }: ProtocolBuilderProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedCategory, setSelectedCategory] = useState("supplements");
  const [protocolName, setProtocolName] = useState("");
  const [protocolDescription, setProtocolDescription] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const getDefaultProtocolItem = (): ProtocolItemForm => ({
    name: "",
    dosageAmount: "",
    dosageUnit: "mg",
    formFactor: "capsule",
    cyclingType: "continuous",
    onCycleDays: "",
    offCycleDays: "",
    currentCyclePhase: "on-cycle",
    cycleStartDate: "",
    cycleEndDate: "",
    trackingKpis: [],
    startTime: "08:00",
    endTime: "",
    fastingType: "goal",
    sets: "",
    reps: "",
    duration: "",
    restTime: "",
    weight: "",
    timing: "08:00",
    frequency: "daily",
    instructions: ""
  });

  const [protocolItems, setProtocolItems] = useState<ProtocolItemForm[]>([
    getDefaultProtocolItem()
  ]);

  // Initialize form with existing protocol data when editing
  useEffect(() => {
    if (editingProtocol && open) {
      setProtocolName(editingProtocol.name);
      setProtocolDescription(editingProtocol.description || "");
      setSelectedCategory(editingProtocol.category);
      setSelectedGoals(editingProtocol.goals || []);
      setStartDate(editingProtocol.startDate || new Date().toISOString().split('T')[0]);
      
      // Load protocol items
      const loadProtocolItems = async () => {
        try {
          const response = await fetch(`/api/protocols/${editingProtocol.id}/items`);
          const items = await response.json();
          if (items.length > 0) {
            setProtocolItems(items.map((item: any) => ({
              name: item.name,
              dosageAmount: item.dosageAmount?.toString() || "",
              dosageUnit: item.dosageUnit || "mg",
              formFactor: item.formFactor || "capsule",
              cyclingType: item.cyclingType || "continuous",
              onCycleDays: item.onCycleDays?.toString() || "",
              offCycleDays: item.offCycleDays?.toString() || "",
              currentCyclePhase: item.currentCyclePhase || "on-cycle",
              cycleStartDate: item.cycleStartDate || "",
              cycleEndDate: item.cycleEndDate || "",
              trackingKpis: item.trackingKpis || [],
              startTime: item.startTime || "",
              endTime: item.endTime || "",
              fastingType: item.fastingType || "goal",
              sets: item.sets?.toString() || "",
              reps: item.reps?.toString() || "",
              duration: item.duration?.toString() || "",
              restTime: item.restTime?.toString() || "",
              weight: item.weight?.toString() || "",
              timing: item.timing || "",
              frequency: item.frequency || "daily",
              instructions: item.instructions || "",
            })));
          }
        } catch (error) {
          console.error('Error loading protocol items:', error);
        }
      };
      
      loadProtocolItems();
    } else if (!editingProtocol && open) {
      // Reset form for new protocol
      setProtocolName("");
      setProtocolDescription("");
      setSelectedCategory("supplements");
      setSelectedGoals([]);
      setProtocolItems([getDefaultProtocolItem()]);
    }
  }, [editingProtocol, open]);

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

  const updateProtocolMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<InsertProtocol> }) => {
      const response = await apiRequest("PATCH", `/api/protocols/${data.id}`, data.updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
      handleClose();
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

  const updateProtocolItemMutation = useMutation({
    mutationFn: async ({ protocolId, items }: { protocolId: number; items: ProtocolItemForm[] }) => {
      try {
        // First, delete existing items
        const deleteResponse = await apiRequest("DELETE", `/api/protocols/${protocolId}/items`);
        
        // Then create new items one by one
        for (const item of items) {
          const response = await apiRequest("POST", `/api/protocols/${protocolId}/items`, {
            ...item,
            order: 0
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to create item: ${item.name} - ${errorText}`);
          }
        }
      } catch (error) {
        console.error("Error in updateProtocolItemMutation:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
      toast({
        title: "Success",
        description: "Protocol updated successfully",
      });
    },
    onError: (error: any) => {
      console.error("Error saving protocol:", error);
      toast({
        title: "Error",
        description: "Failed to update protocol",
        variant: "destructive",
      });
    },
  });

  const archiveProtocolMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("PATCH", `/api/protocols/${id}`, { isActive: false });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/protocols'] });
      handleClose();
      toast({
        title: "Success",
        description: "Protocol archived successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to archive protocol",
        variant: "destructive",
      });
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

    // Validate items based on category
    let validItems;
    if (selectedCategory === "fasting") {
      // For fasting, we need at least a start time
      if (!protocolItems[0]?.startTime) {
        toast({
          title: "Error",
          description: "Please set a start time for fasting",
          variant: "destructive",
        });
        return;
      }
      validItems = [{
        name: "Fasting",
        startTime: protocolItems[0].startTime,
        endTime: protocolItems[0].endTime,
        fastingType: protocolItems[0].fastingType,
        frequency: protocolItems[0].frequency,
        timing: protocolItems[0].startTime,
        dosageAmount: "",
        dosageUnit: "",
        sets: "",
        reps: "",
        duration: "",
        restTime: "",
        weight: "",
        instructions: "",
      }];
    } else {
      // For supplements and exercise, use protocol name as item name
      if (selectedCategory === "supplements") {
        validItems = [{
          name: protocolName, // Use protocol name for supplement
          dosageAmount: protocolItems[0]?.dosageAmount || "",
          dosageUnit: protocolItems[0]?.dosageUnit || "mg",
          formFactor: protocolItems[0]?.formFactor || "",
          timing: protocolItems[0]?.timing || "morning",
          frequency: protocolItems[0]?.frequency || "daily",
          instructions: protocolItems[0]?.instructions || "",
          cyclingType: protocolItems[0]?.cyclingType || "",
          onCycleDays: protocolItems[0]?.onCycleDays || "",
          offCycleDays: protocolItems[0]?.offCycleDays || "",
          currentCyclePhase: protocolItems[0]?.currentCyclePhase || "",
          cycleStartDate: protocolItems[0]?.cycleStartDate || "",
          cycleEndDate: protocolItems[0]?.cycleEndDate || "",
          trackingKpis: protocolItems[0]?.trackingKpis || [],
          startTime: "",
          endTime: "",
          fastingType: "",
          sets: "",
          reps: "",
          duration: "",
          restTime: "",
          weight: "",
        }];
      } else if (selectedCategory === "exercise") {
        validItems = [{
          name: protocolName, // Use protocol name for exercise
          sets: protocolItems[0]?.sets || "",
          reps: protocolItems[0]?.reps || "",
          duration: protocolItems[0]?.duration || "",
          restTime: protocolItems[0]?.restTime || "",
          weight: protocolItems[0]?.weight || "",
          timing: protocolItems[0]?.timing || "morning",
          frequency: protocolItems[0]?.frequency || "daily",
          instructions: protocolItems[0]?.instructions || "",
          dosageAmount: "",
          dosageUnit: "",
          formFactor: "",
          cyclingType: "",
          onCycleDays: "",
          offCycleDays: "",
          currentCyclePhase: "",
          cycleStartDate: "",
          cycleEndDate: "",
          trackingKpis: [],
          startTime: "",
          endTime: "",
          fastingType: "",
        }];
      } else {
        // For other categories, validate items normally
        validItems = protocolItems.filter(item => item.name.trim());
        if (validItems.length === 0) {
          toast({
            title: "Error",
            description: "At least one protocol item is required",
            variant: "destructive",
          });
          return;
        }
      }
    }

    try {
      if (editingProtocol) {
        // Update existing protocol
        await updateProtocolMutation.mutateAsync({
          id: editingProtocol.id,
          updates: {
            name: protocolName,
            description: protocolDescription,
            category: selectedCategory,
            goals: selectedGoals,
            color: "#14B8A6",
            startDate: startDate,
          }
        });

        // Update protocol items
        await updateProtocolItemMutation.mutateAsync({
          protocolId: editingProtocol.id,
          items: validItems.map(item => ({
            name: item.name,
            dosageAmount: item.dosageAmount ? parseInt(item.dosageAmount) : null,
            dosageUnit: item.dosageUnit || null,
            formFactor: item.formFactor || null,
            cyclingType: item.cyclingType || null,
            onCycleDays: item.onCycleDays ? parseInt(item.onCycleDays) : null,
            offCycleDays: item.offCycleDays ? parseInt(item.offCycleDays) : null,
            currentCyclePhase: item.currentCyclePhase || null,
            cycleStartDate: item.cycleStartDate || null,
            cycleEndDate: item.cycleEndDate || null,
            trackingKpis: item.trackingKpis || [],
            startTime: item.startTime || null,
            endTime: item.endTime || null,
            fastingType: item.fastingType || null,
            sets: item.sets ? parseInt(item.sets) : null,
            reps: item.reps ? parseInt(item.reps) : null,
            duration: item.duration ? parseInt(item.duration) : null,
            restTime: item.restTime ? parseInt(item.restTime) : null,
            weight: item.weight ? parseInt(item.weight) : null,
            timing: item.timing || null,
            frequency: item.frequency || "daily",
            instructions: item.instructions || null,
            order: 0
          }))
        });
      } else {
        // Create new protocol
        const protocol = await createProtocolMutation.mutateAsync({
          name: protocolName,
          description: protocolDescription,
          category: selectedCategory,
          goals: selectedGoals,
          isActive: true,
          color: "#14B8A6",
          startDate: startDate,
          userId: 1, // This will be set by the backend
        });

        if (protocol.id) {
          await createProtocolItemMutation.mutateAsync({
            protocolId: protocol.id,
            items: validItems.map(item => ({
              name: item.name,
              dosageAmount: item.dosageAmount ? parseInt(item.dosageAmount) : null,
              dosageUnit: item.dosageUnit || null,
              formFactor: item.formFactor || null,
              cyclingType: item.cyclingType || null,
              onCycleDays: item.onCycleDays ? parseInt(item.onCycleDays) : null,
              offCycleDays: item.offCycleDays ? parseInt(item.offCycleDays) : null,
              currentCyclePhase: item.currentCyclePhase || null,
              cycleStartDate: item.cycleStartDate || null,
              cycleEndDate: item.cycleEndDate || null,
              trackingKpis: item.trackingKpis || [],
              startTime: item.startTime || null,
              endTime: item.endTime || null,
              fastingType: item.fastingType || null,
              sets: item.sets ? parseInt(item.sets) : null,
              reps: item.reps ? parseInt(item.reps) : null,
              duration: item.duration ? parseInt(item.duration) : null,
              restTime: item.restTime ? parseInt(item.restTime) : null,
              weight: item.weight ? parseInt(item.weight) : null,
              timing: item.timing || null,
              frequency: item.frequency || "daily",
              instructions: item.instructions || null,
              order: 0
            }))
          });
        }
      }
    } catch (error) {
      console.error("Error saving protocol:", error);
    }
  };

  const handleClose = () => {
    setProtocolName("");
    setProtocolDescription("");
    setSelectedGoals([]);
    setProtocolItems([
      getDefaultProtocolItem()
    ]);
    setSelectedCategory("supplements");
    onClose();
  };

  const addProtocolItem = () => {
    setProtocolItems([...protocolItems, getDefaultProtocolItem()]);
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
          <DialogTitle>{editingProtocol ? 'Edit Protocol' : 'New Protocol'}</DialogTitle>
          <DialogDescription>
            {editingProtocol ? 'Update your existing health protocol settings.' : 'Create a new health protocol with supplements, exercises, fasting, or nutrition tracking.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Category Selection with Groups */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Protocols</h4>
              <div className="grid grid-cols-2 gap-3">
                {categories.filter(c => c.group === "protocols").map(({ id, label, icon: Icon }) => (
                  <Card 
                    key={id} 
                    className={`cursor-pointer transition-all ${
                      selectedCategory === id 
                        ? "border-primary bg-primary/10" 
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      setSelectedCategory(id);
                      // Reset protocol items when switching categories
                      setProtocolItems([getDefaultProtocolItem()]);
                    }}
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
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">The 3 Levers</h4>
              <div className="grid grid-cols-2 gap-3">
                {categories.filter(c => c.group === "levers").map(({ id, label, icon: Icon }) => (
                  <Card 
                    key={id} 
                    className={`cursor-pointer transition-all ${
                      selectedCategory === id 
                        ? "border-primary bg-primary/10" 
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => {
                      setSelectedCategory(id);
                      // Reset protocol items when switching categories
                      setProtocolItems([getDefaultProtocolItem()]);
                    }}
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
            </div>
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

            <div>
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Protocol Items - Category Specific */}
          {selectedCategory === "fasting" ? (
            <div className="space-y-3">
              <Label>Fasting Schedule</Label>
              <Card className="p-4">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="fast-start-time" className="text-xs">Start Time</Label>
                      <Input
                        id="fast-start-time"
                        type="time"
                        value={protocolItems[0]?.startTime || "08:00"}
                        onChange={(e) => updateProtocolItem(0, "startTime", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fast-type" className="text-xs">Type</Label>
                      <Select 
                        value={protocolItems[0]?.fastingType || "goal"} 
                        onValueChange={(value) => updateProtocolItem(0, "fastingType", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="goal">Goal (Set End Time)</SelectItem>
                          <SelectItem value="live">Live Tracking</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  {protocolItems[0]?.fastingType === "goal" && (
                    <div>
                      <Label htmlFor="fast-end-time" className="text-xs">End Time</Label>
                      <Input
                        id="fast-end-time"
                        type="time"
                        value={protocolItems[0]?.endTime || ""}
                        onChange={(e) => updateProtocolItem(0, "endTime", e.target.value)}
                      />
                    </div>
                  )}
                  
                  <div>
                    <Label htmlFor="fast-frequency" className="text-xs">Frequency</Label>
                    <Select 
                      value={protocolItems[0]?.frequency || "daily"} 
                      onValueChange={(value) => updateProtocolItem(0, "frequency", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="one_time">One Time (1x)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>
                  {selectedCategory === "supplements" ? "Supplements" : 
                   selectedCategory === "nutrition" ? "Foods" : 
                   selectedCategory === "exercise" ? "Exercises" : "Items"}
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={addProtocolItem}>
                  <Plus size={16} className="mr-1" />
                  Add Item
                </Button>
              </div>

              {protocolItems.map((item, index) => (
                <Card key={index} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        {selectedCategory === "supplements" ? `Supplement ${index + 1}` : 
                         selectedCategory === "nutrition" ? `Food ${index + 1}` : 
                         selectedCategory === "exercise" ? `Exercise ${index + 1}` : `Item ${index + 1}`}
                      </Label>
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
                      {selectedCategory !== "supplements" && (
                        <div>
                          <Label htmlFor={`item-name-${index}`} className="text-xs">
                            {selectedCategory === "nutrition" ? "Food Name" : 
                             selectedCategory === "exercise" ? "Exercise Name" : "Name"}
                          </Label>
                          <Input
                            id={`item-name-${index}`}
                            placeholder={selectedCategory === "nutrition" ? "e.g., Oatmeal" : 
                                       selectedCategory === "exercise" ? "e.g., Push-ups" : "Name"}
                            value={item.name}
                            onChange={(e) => updateProtocolItem(index, "name", e.target.value)}
                            className="flex-1"
                          />
                        </div>
                      )}
                      {selectedCategory === "supplements" && (
                        <div>
                          <Label className="text-xs">Supplement Name</Label>
                          <div className="flex items-center space-x-2">
                            <Input
                              value={protocolName}
                              disabled
                              className="flex-1 bg-gray-50 text-gray-600"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="px-2"
                              onClick={() => {
                                alert("Camera feature coming soon!");
                              }}
                            >
                              <Camera size={16} />
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {selectedCategory === "exercise" ? (
                        <div>
                          <Label htmlFor={`item-duration-${index}`} className="text-xs">Duration (minutes)</Label>
                          <Input
                            id={`item-duration-${index}`}
                            placeholder="30"
                            type="number"
                            value={item.duration}
                            onChange={(e) => updateProtocolItem(index, "duration", e.target.value)}
                          />
                        </div>
                      ) : selectedCategory !== "fasting" ? (
                        <div>
                          <Label htmlFor={`item-dosage-${index}`} className="text-xs">
                            {selectedCategory === "nutrition" ? "Portion" : "Dosage"}
                          </Label>
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
                                <SelectItem value="IU">IU</SelectItem>
                                <SelectItem value="mg">mg</SelectItem>
                                <SelectItem value="g">g</SelectItem>
                                <SelectItem value="mcg">mcg</SelectItem>
                                <SelectItem value="ml">ml</SelectItem>
                                <SelectItem value="oz">oz</SelectItem>
                                <SelectItem value="capsules">caps</SelectItem>
                                <SelectItem value="tablets">tabs</SelectItem>
                                <SelectItem value="drops">drops</SelectItem>
                                <SelectItem value="cups">cups</SelectItem>
                                <SelectItem value="tbsp">tbsp</SelectItem>
                                <SelectItem value="tsp">tsp</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Form Factor for Supplements */}
                    {selectedCategory === "supplements" && (
                      <div>
                        <Label htmlFor={`item-form-factor-${index}`} className="text-xs">Form Factor</Label>
                        <Select 
                          value={item.formFactor} 
                          onValueChange={(value) => updateProtocolItem(index, "formFactor", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="capsule">Capsule</SelectItem>
                            <SelectItem value="tablet">Tablet</SelectItem>
                            <SelectItem value="powder">Powder</SelectItem>
                            <SelectItem value="liquid">Liquid</SelectItem>
                            <SelectItem value="dropper">Dropper</SelectItem>
                            <SelectItem value="sublingual">Sublingual</SelectItem>
                            <SelectItem value="injectable">Injectable</SelectItem>
                            <SelectItem value="topical">Topical</SelectItem>
                            <SelectItem value="gummy">Gummy</SelectItem>
                            <SelectItem value="spray">Spray</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Cycling Options for Supplements */}
                    {selectedCategory === "supplements" && (
                      <div className="space-y-3">
                        <Label className="text-xs font-medium">Cycling Protocol</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor={`item-cycling-type-${index}`} className="text-xs">Type</Label>
                            <Select 
                              value={item.cyclingType} 
                              onValueChange={(value) => updateProtocolItem(index, "cyclingType", value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="continuous">Continuous</SelectItem>
                                <SelectItem value="standard">Standard (4wk on/2wk off)</SelectItem>
                                <SelectItem value="micro">Micro (5d on/2d off)</SelectItem>
                                <SelectItem value="extended">Extended (8wk on/4wk off)</SelectItem>
                                <SelectItem value="intensive">Intensive (12wk on/12wk off)</SelectItem>
                                <SelectItem value="custom">Custom</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label htmlFor={`item-cycle-phase-${index}`} className="text-xs">Current Phase</Label>
                            <Select 
                              value={item.currentCyclePhase} 
                              onValueChange={(value) => updateProtocolItem(index, "currentCyclePhase", value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="on-cycle">On-Cycle</SelectItem>
                                <SelectItem value="wash-out">Wash-Out</SelectItem>
                                <SelectItem value="off-cycle">Off-Cycle</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        {item.cyclingType === "custom" && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor={`item-on-cycle-days-${index}`} className="text-xs">On-Cycle Days</Label>
                              <Input
                                id={`item-on-cycle-days-${index}`}
                                placeholder="28"
                                type="number"
                                value={item.onCycleDays}
                                onChange={(e) => updateProtocolItem(index, "onCycleDays", e.target.value)}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`item-off-cycle-days-${index}`} className="text-xs">Off-Cycle Days</Label>
                              <Input
                                id={`item-off-cycle-days-${index}`}
                                placeholder="14"
                                type="number"
                                value={item.offCycleDays}
                                onChange={(e) => updateProtocolItem(index, "offCycleDays", e.target.value)}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedCategory === "exercise" && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor={`item-sets-${index}`} className="text-xs">Sets</Label>
                          <Input
                            id={`item-sets-${index}`}
                            placeholder="3"
                            type="number"
                            value={item.sets}
                            onChange={(e) => updateProtocolItem(index, "sets", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`item-reps-${index}`} className="text-xs">Reps</Label>
                          <Input
                            id={`item-reps-${index}`}
                            placeholder="10"
                            type="number"
                            value={item.reps}
                            onChange={(e) => updateProtocolItem(index, "reps", e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor={`item-weight-${index}`} className="text-xs">Weight (lbs)</Label>
                          <Input
                            id={`item-weight-${index}`}
                            placeholder="50"
                            type="number"
                            value={item.weight}
                            onChange={(e) => updateProtocolItem(index, "weight", e.target.value)}
                          />
                        </div>
                      </div>
                    )}

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
                            <SelectItem value="monthly">Monthly</SelectItem>
                            <SelectItem value="quarterly">Quarterly</SelectItem>
                            <SelectItem value="one_time">One Time (1x)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

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
            {editingProtocol && (
              <Button
                type="button"
                variant="outline"
                onClick={() => archiveProtocolMutation.mutate(editingProtocol.id)}
                disabled={archiveProtocolMutation.isPending}
              >
                {archiveProtocolMutation.isPending ? "Archiving..." : "Archive"}
              </Button>
            )}
            <Button 
              type="submit" 
              className="flex-1"
              disabled={createProtocolMutation.isPending || updateProtocolMutation.isPending}
            >
              {editingProtocol 
                ? (updateProtocolMutation.isPending ? "Saving..." : "Save Changes")
                : (createProtocolMutation.isPending ? "Creating..." : "Create Protocol")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
