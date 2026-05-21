import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Legge la sessione esistente (es. refresh della pagina con sessione attiva)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('[investsim] getSession →', 'user:', session?.user?.email ?? null, '| error:', error)
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // 2. Ascolta tutti i cambiamenti di stato auth (login, logout, token refresh…)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[investsim] onAuthStateChange →', 'event:', event, '| user:', session?.user?.email ?? null)
      setUser(session?.user ?? null);
      // setLoading(false) è già gestito da getSession; qui non serve
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = (email, password) =>
    supabase.auth.signInWithPassword({ email, password });

  const signup = (email, password) =>
    supabase.auth.signUp({ email, password });

  const logout = () => supabase.auth.signOut();

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
