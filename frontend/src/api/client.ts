import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3334/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("closet_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error.response?.status;
    const apiMessage = error.response?.data?.message as string | undefined;

    if (status === 401) {
      localStorage.removeItem("closet_token");
      const onAuthPage =
        window.location.pathname.startsWith("/login") ||
        window.location.pathname.startsWith("/register");
      if (!onAuthPage) {
        window.location.href = "/login";
      }
    }

    return Promise.reject(
      new Error(apiMessage || error.message || "Erro na requisição"),
    );
  },
);

export default api;
