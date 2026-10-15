import ENV from "@/config/env";
import { useAuthStore } from "@/contexts/AuthContext";
import axios from "axios";
export let BASE_URL = ENV.BACKEND_URL;

const axiosConfig = {
  baseURL: ENV.BACKEND_URL,
  withCredentials: true,
};

export const axiosClient = {
  axios: axios.create(axiosConfig),
  _axios: axios,
  attachInterceptors: function () {
    this.axios.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;

        if (!error.response) {
          return Promise.reject(error);
        }

        if (originalRequest.url === "/api/auth/token") {
          return Promise.reject(error);
        }

        const is401 = error.response.status === 401;

        if (is401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // if (is401) {
          //   originalRequest._retryCount = originalRequest._retryCount || 0;

          //   if (originalRequest._retryCount < 3) {
          //     originalRequest._retryCount += 1;

          const newToken = await this.refreshToken();

          if (newToken) {
            originalRequest.headers = {
              ...originalRequest.headers,
              Authorization: `Bearer ${newToken}`,
            };

            return this.axios(originalRequest);
          }
          // }

          useAuthStore.getState().logout();
          window.location.href = "/login";
        }

        return Promise.reject(error);
      }
    );
  },

  refreshToken: async function () {
    try {
      const res = await this.axios.get("/api/auth/token", {
        withCredentials: true,
      });

      const newAccessToken = res.data.data.accessToken;
      const user = res.data.data.user;

      useAuthStore.getState().login(user, newAccessToken);
      return newAccessToken;
    } catch (error) {
      console.log("Refresh failed", error);
      return null;
    }
  },
};

axiosClient.attachInterceptors();
