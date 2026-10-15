import { useApi } from "@/lib/useApi";
import type { SessionUser } from "@/lib/useApi/types/authenticationApis.types";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";

// ---------------- TYPES ----------------

interface UnAuthenticatedState {
  session: null;
  status: "unauthenticated";
}
interface LoadingState {
  session: null;
  status: "loading";
}
interface AuthenticatedState {
  session: SessionUser;
  status: "authenticated";
}

type AuthState = UnAuthenticatedState | LoadingState | AuthenticatedState;

interface AuthStore {
  accessToken: string;
  auth: AuthState;
  isLoggingOut: boolean;

  // actions
  setLoading: () => void;
  login: (session: SessionUser, accessToken: string) => void;
  logout: () => void;
}

// export let accessToken = "";

// ---------------- STORE ----------------

export const useAuthStore = create<AuthStore>(set => ({
  accessToken: "",

  auth: {
    session: null,
    status: "loading",
  },

  isLoggingOut: false,

  setLoading: () => {
    set(state => ({ auth: { session: null, status: "loading" } }));
  },

  login: (session, newAccessToken) => {
    set(state => ({ accessToken: newAccessToken, auth: { session, status: "authenticated" } }));
  },

  logout: () => {
    set(state => ({
      accessToken: "",
      auth: { session: null, status: "unauthenticated" },
      isLoggingOut: false,
    }));
  },
}));

interface AuthProviderProps {
  children: ReactNode;
}

const AuthProvider = ({ children }: AuthProviderProps) => {
  const { setLoading, login, logout } = useAuthStore();
  const isLoginPage = window.location.pathname === "/login";

  const code = new URLSearchParams(window.location.search).get("code") || "";

  const { mutateAsync: exchangeCode } = useApi("POST /api/auth/sso/exchange-code");

  const { data, isLoading, isSuccess } = useApi("GET /api/auth/token", {
    enabled: !code && !isLoginPage,
  });

  useEffect(() => {
    if (!code) return;

    const handleSSO = async () => {
      try {
        setLoading();

        const res = await exchangeCode({
          code,
        });

        login(res.data.user, res.data.accessToken);
      } catch (e) {
        logout();
      }
    };

    handleSSO();
  }, [code]);

  useEffect(() => {
    if (isLoading) {
      setLoading();
    } else if (data && isSuccess) {
      login(data.data.user, data.data.accessToken);
    } else if (!data && !code) {
      logout();
    }
  }, [isLoading, data]);

  return children;
};

export default AuthProvider;
