import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/api/agents";
import type { AgentType } from "@fictia/shared";

export function useAgentOutputs(novelId: string | undefined) {
  return useQuery({
    queryKey: ["agent-outputs", novelId],
    queryFn: () => agentsApi.listOutputs(novelId!),
    enabled: !!novelId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !Array.isArray(data)) return false;
      return data.some((o: any) => o.status === "running" || o.status === "pending") ? 3000 : false;
    },
  });
}

export function useTriggerNovelAgent(novelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentType, persona }: { agentType: AgentType; persona?: string }) =>
      agentsApi.triggerNovelAgent(novelId, agentType, persona),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-outputs", novelId] });
      qc.invalidateQueries({ queryKey: ["novel", novelId] });
    },
  });
}

export function useTriggerChapterAgent(chapterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentType, persona }: { agentType: AgentType; persona?: string }) =>
      agentsApi.triggerChapterAgent(chapterId, agentType, persona),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-outputs"] });
      qc.invalidateQueries({ queryKey: ["feedback", chapterId] });
    },
  });
}

export function useAgentStatus(outputId: string | undefined) {
  return useQuery({
    queryKey: ["agent-status", outputId],
    queryFn: () => agentsApi.getStatus(outputId!),
    enabled: !!outputId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" ? 2000 : false;
    },
  });
}
