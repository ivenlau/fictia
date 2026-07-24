import { api } from "./client";
import type {
  AiGenerateTextRequest,
  AiGenerateTextResponse,
} from "@fictia/shared";

export const aiApi = {
  generateText: (data: AiGenerateTextRequest) =>
    api.post<AiGenerateTextResponse>("/ai/generate-text", data),
};
