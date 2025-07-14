import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import Protocols from "@/pages/protocols";
import Analytics from "@/pages/analytics";
import Profile from "@/pages/profile";
import Header from "@/components/header";
import BottomNav from "@/components/bottom-nav";

function Router() {
  return (
    <div className="mobile-container">
      <Header />
      <main className="bottom-nav-height">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/calendar" component={Calendar} />
          <Route path="/protocols" component={Protocols} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/profile" component={Profile} />
          <Route>
            <div className="flex items-center justify-center h-64">
              <p className="text-gray-500">Page not found</p>
            </div>
          </Route>
        </Switch>
      </main>
      <BottomNav />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
