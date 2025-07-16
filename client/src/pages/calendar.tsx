import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { generateCalendarDays, getMonthName, formatDate } from "@/lib/date-utils";
import { apiRequest } from "@/lib/queryClient";
import TaskItem from "@/components/task-item";
import ProtocolBuilder from "@/components/protocol-builder";
import type { Task, ProtocolItem } from "@shared/schema";

export default function Calendar() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showProtocolBuilder, setShowProtocolBuilder] = useState(false);
  const queryClient = useQueryClient();
  const today = formatDate(new Date());
  
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const selectedDateString = formatDate(selectedDate);

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['/api/tasks', { date: selectedDateString }],
    queryFn: async () => {
      const response = await fetch(`/api/tasks?date=${selectedDateString}`);
      const tasks = await response.json();
      
      // If no tasks exist for future dates, generate them
      if (tasks.length === 0 && selectedDateString > today) {
        const generateResponse = await apiRequest("POST", "/api/tasks/generate", { 
          date: selectedDateString 
        });
        const result = await generateResponse.json();
        // Fetch the newly generated tasks
        const newTasksResponse = await fetch(`/api/tasks?date=${selectedDateString}`);
        return newTasksResponse.json();
      }
      
      return tasks;
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const response = await apiRequest("PATCH", `/api/tasks/${taskId}`, { 
        completed,
        completedAt: completed ? new Date().toISOString() : null
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
    },
  });

  const handleTaskToggle = (taskId: number, completed: boolean) => {
    // Prevent checking off future tasks
    if (selectedDateString > today) {
      return;
    }
    toggleTaskMutation.mutate({ taskId, completed });
  };

  const { data: protocolItems = [] } = useQuery<ProtocolItem[]>({
    queryKey: ['/api/protocol-items'],
    queryFn: async () => {
      const response = await fetch('/api/protocols');
      const protocols = await response.json();
      const allItems = [];
      for (const protocol of protocols) {
        const items = await fetch(`/api/protocols/${protocol.id}/items`).then(res => res.json());
        allItems.push(...items);
      }
      return allItems;
    },
  });

  const calendarDays = generateCalendarDays(year, month);

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(month + (direction === 'next' ? 1 : -1));
    setSelectedDate(newDate);
  };

  const selectDate = (date: string) => {
    setSelectedDate(new Date(date));
  };

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Calendar</h1>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowProtocolBuilder(true)}
        >
          <Plus size={16} className="mr-1" />
          New Protocol
        </Button>
      </div>

      {/* Calendar */}
      <Card>
        <CardContent className="p-6">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigateMonth('prev')}>
              <ChevronLeft size={16} />
            </Button>
            <h2 className="text-lg font-semibold text-slate-800">
              {getMonthName(formatDate(selectedDate))}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => navigateMonth('next')}>
              <ChevronRight size={16} />
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 mb-6">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs text-gray-500 p-2 font-medium">
                {day}
              </div>
            ))}
            
            {/* Calendar days */}
            {calendarDays.map((day, index) => (
              <Button
                key={index}
                variant={day.date === selectedDateString ? "default" : "ghost"}
                size="sm"
                className={`h-10 text-sm ${
                  !day.isCurrentMonth 
                    ? "text-gray-400" 
                    : day.isToday 
                      ? "bg-primary/10 text-primary font-semibold" 
                      : ""
                }`}
                onClick={() => selectDate(day.date)}
              >
                {day.day}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Selected Date Tasks */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">
              {selectedDateString === today ? "Today's Tasks" : `Tasks for ${selectedDateString}`}
            </h3>
            <div className="text-sm text-gray-600">
              {tasks.filter(t => t.completed).length} of {tasks.length} completed
            </div>
          </div>

          <div className="space-y-3">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const item = protocolItems.find(item => item.id === task.protocolItemId);
                return item ? (
                  <TaskItem
                    key={task.id}
                    task={task}
                    protocolItem={item}
                    onToggle={handleTaskToggle}
                    isFutureDate={selectedDateString > today}
                  />
                ) : null;
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No tasks scheduled for this date</p>
                <Button 
                  variant="outline" 
                  className="mt-2"
                  onClick={() => setShowProtocolBuilder(true)}
                >
                  Create Protocol
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Overview */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Monthly Overview</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-primary">
                {tasks.length > 0 ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100) : 0}%
              </div>
              <div className="text-sm text-gray-600">Today's Compliance</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-secondary">
                {tasks.length}
              </div>
              <div className="text-sm text-gray-600">Total Tasks</div>
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
