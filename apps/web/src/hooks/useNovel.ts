import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { novelsApi } from "@/api/novels";
import { chaptersApi } from "@/api/chapters";
import type { CreateNovelRequest } from "@fictia/shared";

export function useNovels() {
  return useQuery({
    queryKey: ["novels"],
    queryFn: novelsApi.list,
  });
}

export function useNovel(id: string | undefined) {
  return useQuery({
    queryKey: ["novel", id],
    queryFn: () => novelsApi.get(id!),
    enabled: !!id,
  });
}

export function useCreateNovel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNovelRequest) => novelsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["novels"] }),
  });
}

export function useUpdateNovel(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateNovelRequest>) => novelsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["novels"] });
      qc.invalidateQueries({ queryKey: ["novel", id] });
    },
  });
}

export function useResetNovel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => novelsApi.reset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["novels"] });
      qc.invalidateQueries({ queryKey: ["novel"] });
      qc.invalidateQueries({ queryKey: ["chapters"] });
    },
  });
}

export function useDeleteNovel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => novelsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["novels"] }),
  });
}

export function useChapters(novelId: string | undefined) {
  return useQuery({
    queryKey: ["chapters", novelId],
    queryFn: () => chaptersApi.list(novelId!),
    enabled: !!novelId,
  });
}

export function useChapter(id: string | undefined) {
  return useQuery({
    queryKey: ["chapter", id],
    queryFn: () => chaptersApi.get(id!),
    enabled: !!id,
  });
}

export function useChapterFeedback(chapterId: string | undefined) {
  return useQuery({
    queryKey: ["feedback", chapterId],
    queryFn: () => chaptersApi.getFeedback(chapterId!),
    enabled: !!chapterId,
  });
}

export function useCreateChapter(novelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { number: number; title: string; goal: string }) =>
      chaptersApi.create(novelId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chapters", novelId] });
    },
  });
}
