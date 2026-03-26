import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import Dashboard from "@/pages/dashboard";
import LogShot from "@/pages/log-shot";
import Journal from "@/pages/journal";
import Progress from "@/pages/progress";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Protocols from "@/pages/protocols";
import PeptideCalculator from "@/pages/peptide-calculator";
import Header from "@/components/header";
import BottomNav from "@/components/bottom-nav";

function DeviceSyncTrigger() {
  useEffect(() => {
    apiRequest("POST", "/api/integrations/auto-sync", {})
      .then((res) => res.json())
      .then((data: { withingsSynced?: boolean; ouraSynced?: boolean }) => {
        if (data.withingsSynced) {
          queryClient.invalidateQueries({ queryKey: ["/api/progress-photos"] });
          queryClient.invalidateQueries({ queryKey: ["/api/analytics/dashboard"] });
        }
        if (data.ouraSynced) {
          queryClient.invalidateQueries({ queryKey: ["/api/oura-daily"] });
        }
      })
      .catch(() => {});
  }, []);
  return null;
}

function Router() {
  return (
    <div className="mobile-container">
      <Header />
      <main className="bottom-nav-height">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/log-shot" component={LogShot} />
          <Route path="/journal" component={Journal} />
          <Route path="/progress" component={Progress} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/protocols" component={Protocols} />
          <Route path="/calculate" component={PeptideCalculator} />
          <Route path="/settings" component={Settings} />
          <Route path="/profile">
            <Redirect to="/settings" />
          </Route>
          <Route>
            <div className="flex items-center justify-center h-64">
              <p className="text-muted-foreground">Page not found</p>
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
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <DeviceSyncTrigger />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
