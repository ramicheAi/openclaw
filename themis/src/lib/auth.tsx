// Auth context + provider. Probes /api/auth/me on boot; exposes the
// current session shape to the rest of the app. In single-user mode the
// provider is a no-op pass-through so the existing UI works unchanged.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type AuthMe } from "./api";

interface AuthState {
  ready: boolean;
  mode: "single-user" | "multi-tenant";
  user: { email: string; name: string } | null;
  /** Re-fetch from /api/auth/me. Use after login/logout. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  ready: false,
  mode: "single-user",
  user: null,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthMe | null>(null);

  async function load() {
    try {
      const me = await api.getMe();
      setState(me);
    } catch {
      // Server unreachable / not auth-aware. Treat as single-user so the
      // dashboard still loads instead of erroring out at boot.
      setState({ mode: "single-user", user: null });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ready: state !== null,
        mode: state?.mode ?? "single-user",
        user: state?.user ?? null,
        refresh: load,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
