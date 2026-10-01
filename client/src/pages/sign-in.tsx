import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Lock, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface AuthConfig {
  google: boolean;
  demo: boolean;
}

const AUTH_ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet.",
  google_denied: "Google sign-in was cancelled.",
  google_state_invalid: "Your sign-in link expired. Please try again.",
  google_failed: "We couldn't sign you in with Google. Please try again.",
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function SignIn() {
  const queryClient = useQueryClient();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const { data: config } = useQuery<AuthConfig>({ queryKey: ["/api/auth/config"] });

  const errorCode = new URLSearchParams(window.location.search).get("auth_error");
  const error = demoError ?? (errorCode ? AUTH_ERRORS[errorCode] ?? AUTH_ERRORS.google_failed : null);

  const signInDemo = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await apiRequest("POST", "/api/auth/demo");
      window.history.replaceState(null, "", "/");
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    } catch {
      setDemoError("Demo sign-in failed. Please try again.");
      setDemoLoading(false);
    }
  };

  return (
    <div className="mobile-container min-h-screen flex flex-col justify-center px-6 py-12">
      <div className="flex flex-col items-center text-center mb-10">
        <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center shadow-md mb-5">
          <Activity className="text-white" size={30} strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">LevelTrack</h1>
        <p className="text-muted-foreground mt-2 max-w-xs">
          Track your GLP-1 shots, peptides, symptoms and progress in one private place.
        </p>
      </div>

      <div className="space-y-3">
        <Button
          asChild={!!config?.google}
          disabled={!config?.google}
          variant="outline"
          className="w-full h-12 text-base font-semibold bg-card"
        >
          {config?.google ? (
            <a href="/api/auth/google" data-testid="button-google-signin">
              <GoogleLogo />
              <span className="ml-3">Continue with Google</span>
            </a>
          ) : (
            <span>
              <GoogleLogo />
              <span className="ml-3">Continue with Google</span>
            </span>
          )}
        </Button>

        {config && !config.google && (
          <p className="text-xs text-center text-muted-foreground">
            Google sign-in isn't configured yet (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).
          </p>
        )}

        {config?.demo && (
          <Button
            variant="ghost"
            className="w-full h-11 text-sm"
            onClick={signInDemo}
            disabled={demoLoading}
            data-testid="button-demo-signin"
          >
            <UserIcon size={16} className="mr-2" />
            {demoLoading ? "Signing in…" : "Try the demo account"}
          </Button>
        )}

        {error && (
          <p role="alert" className="text-sm text-center text-destructive pt-1">{error}</p>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-10">
        <Lock size={12} />
        Your health data stays private to your account.
      </p>
    </div>
  );
}
