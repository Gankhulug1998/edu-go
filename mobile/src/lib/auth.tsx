import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, loadToken, setToken, User } from './api';

type AuthState = {
  user: User | null;
  loading: boolean;
  progress: Record<string, string>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  setStatus: (ch: string, status: string | null) => void;
};

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, string>>({});

  const refreshProgress = useCallback(async () => {
    try { setProgress(await api.progress()); } catch { setProgress({}); }
  }, []);

  useEffect(() => {
    (async () => {
      await loadToken();
      const u = await api.me();
      setUser(u);
      if (u) await refreshProgress();
      setLoading(false);
    })();
  }, [refreshProgress]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await setToken(res.token); setUser(res.user); await refreshProgress();
  }, [refreshProgress]);

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    const res = await api.signup(email, password, name);
    await setToken(res.token); setUser(res.user); await refreshProgress();
  }, [refreshProgress]);

  const logout = useCallback(async () => {
    await api.logout(); await setToken(null); setUser(null); setProgress({});
  }, []);

  const setStatus = useCallback((ch: string, status: string | null) => {
    setProgress((p) => { const n = { ...p }; if (status) n[ch] = status; else delete n[ch]; return n; });
    if (status) api.setProgress(ch, status); else api.removeProgress(ch);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, progress, login, signup, logout, setStatus }}>
      {children}
    </Ctx.Provider>
  );
}
