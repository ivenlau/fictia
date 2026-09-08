import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import {
  applyTheme,
  DEFAULT_THEME,
  readStoredCustom,
  type ThemeId,
} from "./styles/themes";
import "./styles/theme-vars.css";
import "./index.css";

applyTheme(
  (() => {
    try {
      const raw = localStorage.getItem("fictia.theme");
      return ((raw as ThemeId) || DEFAULT_THEME) as ThemeId;
    } catch {
      return DEFAULT_THEME;
    }
  })(),
  readStoredCustom(),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
