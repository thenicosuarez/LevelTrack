import { Bell, FlaskConical } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { User } from "@shared/schema";

export default function Header() {
  const { data: user } = useQuery<User>({
    queryKey: ['/api/user'],
  });

  return (
    <header className="bg-card sticky top-0 z-50 border-b border-border px-4 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 gradient-outlive rounded-lg flex items-center justify-center shadow-sm">
            <FlaskConical className="text-primary" size={16} />
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Nurtur Stack</h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <Bell className="text-gray-600" size={16} />
          </Button>
          
          <Avatar className="w-8 h-8">
            <AvatarImage src={user?.avatar || undefined} alt={user?.name} />
            <AvatarFallback>
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
