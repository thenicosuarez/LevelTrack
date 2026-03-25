import { useLocation } from "wouter";
import { Home, Syringe, BookOpen, Shield, BarChart2 } from "lucide-react";

const navItems = [
  { path: "/", label: "Home", icon: Home },
  { path: "/log-shot", label: "Log Shot", icon: Syringe },
  { path: "/journal", label: "Journal", icon: BookOpen },
  { path: "/protocols", label: "Protocols", icon: Shield },
  { path: "/analytics", label: "Analytics", icon: BarChart2 },
];

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-card border-t border-border safe-bottom"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around px-1 pt-2 pb-2">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = location === path;
          return (
            <button
              key={path}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all touch-target min-w-[56px] ${
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setLocation(path)}
            >
              <div className={`p-1.5 rounded-xl transition-all ${active ? "bg-primary/10" : ""}`}>
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              </div>
              <span className={`text-[10px] font-medium leading-none ${active ? "text-primary" : ""}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
