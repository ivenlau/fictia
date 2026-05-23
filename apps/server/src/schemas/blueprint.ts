import { Type, type Static } from "@sinclair/typebox";

export const ActSchema = Type.Object({
  name: Type.String(),
  chapters: Type.Array(Type.Number()),
  purpose: Type.String(),
  word_count: Type.Number(),
  key_plot_points: Type.Array(Type.String()),
});

export const BlueprintSchema = Type.Object({
  total_words: Type.Number(),
  volumes: Type.Number(),
  structure_type: Type.String(),
  acts: Type.Array(ActSchema),
  pacing_strategy: Type.Object({
    tension_curve: Type.String(),
    rest_chapters: Type.Array(Type.Number()),
    climax_chapters: Type.Array(Type.Number()),
  }),
});

export type Blueprint = Static<typeof BlueprintSchema>;
export type Act = Static<typeof ActSchema>;
