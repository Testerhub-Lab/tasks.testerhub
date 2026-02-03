import { useCallback, useEffect, useState } from "react";

type CurrentUser = {
  id: string;
  name: string | null;
  email: string | null;
};

type MeResponse =
  | { ok: true; user: CurrentUser }
  | { ok: false };

type AuthState = {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include",
      });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) {
        setUser(null);
        return;
      }
      const json = (await res.json().catch(() => null)) as unknown;
      if (!json || typeof json !== "object") {
        setUser(null);
        return;
      }
      const data = json as MeResponse;
      if (!("ok" in data) || data.ok !== true) {
        setUser(null);
        return;
      }
      if (!data.user || !data.user.id) {
        setUser(null);
        return;
      }
      setUser({
        id: data.user.id,
        name: data.user.name ?? null,
        email: data.user.email ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { user, loading, refresh };
}
