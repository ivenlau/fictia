import { api } from "./client";
import type { Settings } from "@fictia/shared";

export const settingsApi = {
  get: () => api.get<Settings>("/settings"),
  // update 走扁平字段（reviewPassGrade/reviewSevereHardFail 由服务端拆进 reviewPolicy）
  update: (
    data: Partial<Settings> & {
      reviewPassGrade?: "A" | "B" | "C";
      reviewSevereHardFail?: number;
    },
  ) => api.patch<Settings>("/settings", data),
};
