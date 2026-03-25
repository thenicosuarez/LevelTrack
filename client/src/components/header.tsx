import { Bell, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { User } from "@shared/schema";

const pageTitles: Record<string, string> = {
  "/": "LevelTrack",
  "/log-shot": "Log Shot",
  "/journal": "Symptom Journal",
  "/progress": "Progress",
  "/profile": "Profile",
};

export default function Header() {
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  const [location] = useLocation();
  const title = pageTitles[location] ?? "LevelTrack";

  return (
    <header className="bg-card sticky top-0 z-50 border-b border-border px-4 py-3" style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 gradient-primary rounded-xl flex items-center justify-center shadow-sm">
            <Activity className="text-white" size={15} strokeWidth={2.5} />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
        </div>
        
        <div className="flex items-center space-x-1">
          <Button variant="ghost" size="sm" className="w-9 h-9 p-0 rounded-full">
            <Bell className="text-muted-foreground" size={17} />
          </Button>
          
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
            <AvatarFallback className="text-xs font-semibold bg-primary text-primary-foreground">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
