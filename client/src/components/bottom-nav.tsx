import { useLocation } from "wouter";
import { Home, Calendar, FlaskConical, TrendingUp, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/calendar", label: "Calendar", icon: Calendar },
  { path: "/protocols", label: "Protocols", icon: FlaskConical },
  { path: "/analytics", label: "Analytics", icon: TrendingUp },
  { path: "/profile", label: "Profile", icon: User },
];

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav className="fixed bottom-0 left-1/2 transform -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 px-4 py-3">
      <div className="flex items-center justify-around">
        {navItems.map(({ path, label, icon: Icon }) => (
          <Button
            key={path}
            variant="ghost"
            size="sm"
            className={`flex flex-col items-center space-y-0.5 px-2 py-1 h-12 ${
              location === path ? "text-primary" : "text-gray-500"
            } hover:bg-gray-50 rounded-md`}
            onClick={() => setLocation(path)}
          >
            <Icon size={16} />
            <span className="text-xs leading-tight">{label}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
}
