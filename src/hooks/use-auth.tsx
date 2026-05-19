import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "tech" | "reviewer";

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
}

export function profileDisplayName(p: UserProfile | null, fallback?: string | null): string {
  if (!p) return fallback ?? "";
  const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return fl || p.full_name || p.email || fallback || "";
}

interface AuthState {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null, session: null, role: null, profile: null, loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = (userId: string) => {
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle().then(({ data }) => {
      setProfile((data as UserProfile | null) ?? null);
    });
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          supabase.from("user_roles").select("role").eq("user_id", s.user.id).then(({ data }) => {
            const roles = (data ?? []).map(r => r.role as AppRole);
            const priority: AppRole[] = ["admin", "reviewer", "tech"];
            setRole(priority.find(p => roles.includes(p)) ?? null);
          });
          loadProfile(s.user.id);
        }, 0);
      } else {
        setRole(null);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        supabase.from("user_roles").select("role").eq("user_id", data.session.user.id).then(({ data: r }) => {
          const roles = (r ?? []).map(x => x.role as AppRole);
          const priority: AppRole[] = ["admin", "reviewer", "tech"];
          setRole(priority.find(p => roles.includes(p)) ?? null);
          setLoading(false);
        });
        loadProfile(data.session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthCtx.Provider value={{
      user: session?.user ?? null,
      session, role, profile, loading,
      signOut: async () => { await supabase.auth.signOut(); },
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
