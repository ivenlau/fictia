import { Type, type Static } from "@sinclair/typebox";

export const StageStatusSchema = Type.Union([
  Type.Literal("not_started"),
  Type.Literal("in_progress"),
  Type.Literal("pending_confirm"),
  Type.Literal("confirmed"),
  Type.Literal("needs_update"),
  Type.Literal("failed"),
]);

export const StageStateSchema = Type.Object({
  status: StageStatusSchema,
  confirmedAt: Type.Optional(Type.String()),
  reason: Type.Optional(Type.String()),
  outputFiles: Type.Optional(Type.Array(Type.String())),
});

export const ProjectSchema = Type.Object({
  name: Type.String(),
  author: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  created: Type.String(),
  last_modified: Type.String(),
  version: Type.Number(),
  genre: Type.Optional(Type.String()),
  target_words: Type.Optional(Type.Number()),
  target_volumes: Type.Optional(Type.Number()),
  chapter_target_words: Type.Optional(Type.Number()),
  pipeline: Type.Optional(Type.Record(Type.String(), StageStateSchema)),
  chapters: Type.Optional(Type.Object({
    total: Type.Number(),
    written: Type.Number(),
    confirmed: Type.Number(),
  })),
});

export type Project = Static<typeof ProjectSchema>;
export type StageStatus = Static<typeof StageStatusSchema>;
export type StageState = Static<typeof StageStateSchema>;
