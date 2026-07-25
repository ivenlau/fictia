import { api } from "./client";
import type { Chapter, ReviewFeedback } from "@fictia/shared";

export const chaptersApi = {
  list: (novelId: string) => api.get<Chapter[]>(`/novels/${novelId}/chapters`),
  get: (id: string) => api.get<Chapter>(`/chapters/${id}`),
  update: (id: string, data: Partial<Chapter>) => api.patch<Chapter>(`/chapters/${id}`, data),
  getFeedback: (id: string) => api.get<ReviewFeedback[]>(`/chapters/${id}/feedback`),
};
