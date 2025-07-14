import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { User, Settings, Link, Bell, Download, Trash2, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import type { User as UserType, Integration } from "@shared/schema";

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");

  const { data: user } = useQuery<UserType>({
    queryKey: ['/api/user'],
    onSuccess: (data) => {
      setEditedName(data.name);
    },
  });

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ['/api/integrations'],
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: Partial<UserType>) => {
      const response = await apiRequest("PATCH", "/api/user", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsEditing(false);
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleUpdateProfile = () => {
    updateUserMutation.mutate({ name: editedName });
  };

  const handleCancelEdit = () => {
    setEditedName(user?.name || "");
    setIsEditing(false);
  };

  const mockAchievements = [
    { id: 1, name: "First Week", description: "Complete 7 days in a row", earned: true },
    { id: 2, name: "Protocol Master", description: "Create 5 protocols", earned: true },
    { id: 3, name: "Consistency King", description: "30 day streak", earned: false },
    { id: 4, name: "Early Bird", description: "Complete morning routine 10 times", earned: true },
  ];

  const mockIntegrations = [
    { platform: "Oura Ring", connected: false, icon: "❤️" },
    { platform: "MyFitnessPal", connected: false, icon: "🍎" },
    { platform: "Apple Health", connected: false, icon: "🏥" },
    { platform: "Google Fit", connected: false, icon: "🏃" },
  ];

  return (
    <div className="px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Profile</h1>
        <Button variant="outline" size="sm">
          <Settings size={16} className="mr-1" />
          Settings
        </Button>
      </div>

      {/* Profile Info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-4 mb-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={user?.avatar} alt={user?.name} />
              <AvatarFallback className="text-lg">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    placeholder="Your name"
                  />
                  <div className="flex space-x-2">
                    <Button size="sm" onClick={handleUpdateProfile}>Save</Button>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold text-slate-800">{user?.name}</h2>
                  <p className="text-gray-600">{user?.email}</p>
                  <Button variant="ghost" size="sm" className="mt-1 p-0" onClick={() => setIsEditing(true)}>
                    Edit Profile
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{user?.streak || 0}</div>
              <div className="text-sm text-gray-600">Day Streak</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary">{user?.totalCompliance || 0}%</div>
              <div className="text-sm text-gray-600">Total Compliance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {mockAchievements.filter(a => a.earned).length}
              </div>
              <div className="text-sm text-gray-600">Achievements</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Achievements */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Achievements</h3>
          <div className="grid grid-cols-2 gap-3">
            {mockAchievements.map((achievement) => (
              <div
                key={achievement.id}
                className={`p-3 rounded-lg border-2 ${
                  achievement.earned
                    ? "bg-success/10 border-success text-success"
                    : "bg-gray-50 border-gray-200 text-gray-500"
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Award size={16} />
                  <span className="font-medium text-sm">{achievement.name}</span>
                </div>
                <p className="text-xs">{achievement.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Health Integrations */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Health Integrations</h3>
          <div className="space-y-3">
            {mockIntegrations.map((integration, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                    <span className="text-lg">{integration.icon}</span>
                  </div>
                  <div>
                    <div className="font-medium text-slate-800">{integration.platform}</div>
                    <div className="text-sm text-gray-600">
                      {integration.connected ? "Connected" : "Not connected"}
                    </div>
                  </div>
                </div>
                <Button 
                  variant={integration.connected ? "outline" : "default"} 
                  size="sm"
                  onClick={() => toast({
                    title: "Coming Soon",
                    description: `${integration.platform} integration will be available soon`
                  })}
                >
                  {integration.connected ? "Disconnect" : "Connect"}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Notifications</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Bell size={20} className="text-gray-600" />
                <div>
                  <div className="font-medium">Protocol Reminders</div>
                  <div className="text-sm text-gray-600">Get notified when it's time for your protocols</div>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Award size={20} className="text-gray-600" />
                <div>
                  <div className="font-medium">Achievement Alerts</div>
                  <div className="text-sm text-gray-600">Celebrate your wins and milestones</div>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Data Management</h3>
          <div className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              <Download size={16} className="mr-2" />
              Export Data
            </Button>
            <Button variant="outline" className="w-full justify-start">
              <Link size={16} className="mr-2" />
              Import Data
            </Button>
            <Button variant="outline" className="w-full justify-start text-red-500 hover:text-red-700">
              <Trash2 size={16} className="mr-2" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* App Version */}
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-sm text-gray-600">
            <p>Nurtur Stack v1.0.0</p>
            <p className="mt-1">Built with 💚 for optimal health</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
