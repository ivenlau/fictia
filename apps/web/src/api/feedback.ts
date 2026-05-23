import { api } from "./client";
import type { ReviewFeedback } from "@fictia/shared";

export const feedbackApi = {
  adopt: (id: string) => api.patch<ReviewFeedback>(`/feedback/${id}/adopt`),
  ignore: (id: string) => api.patch<ReviewFeedback>(`/feedback/${id}/ignore`),
};
