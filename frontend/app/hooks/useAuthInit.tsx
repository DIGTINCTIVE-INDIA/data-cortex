import { useAuthStore } from "@/contexts/AuthContext";
import { useApi } from "@/lib/useApi";
import { useEffect } from "react";

export const useAuthInit = () => {
  const { setLoading, login, logout } = useAuthStore();

  const isLoginPage = window.location.pathname === "/login";
  const code = new URLSearchParams(window.location.search).get("code") || "";

  const { mutateAsync: exchangeCode } = useApi("POST /api/auth/sso/exchange-code");

  const { data, isLoading, isSuccess } = useApi("GET /api/auth/token", {
    enabled: !code && !isLoginPage,
  });

  // -------- SSO --------
  useEffect(() => {
    if (!code) return;

    const handleSSO = async () => {
      try {
        setLoading();
        const res = await exchangeCode({ code });
        login(res.data.user, res.data.accessToken);
      } catch {
        logout();
      }
    };

    handleSSO();
  }, [code]);

  // -------- TOKEN FETCH --------
  useEffect(() => {
    if (isLoading) {
      setLoading();
    } else if (data && isSuccess) {
      login(data.data.user, data.data.accessToken);
    } else if (!data && !code) {
      logout();
    }
  }, [isLoading, data]);
};
