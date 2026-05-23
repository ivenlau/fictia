import { Type, type Static } from "@sinclair/typebox";

export const GenreAnalysisSchema = Type.Object({
  genre: Type.String(),
  sub_genre: Type.Optional(Type.String()),
  core_elements: Type.Array(Type.String()),
  reader_expectations: Type.Array(Type.String()),
  common_patterns: Type.Array(Type.String()),
  innovation_space: Type.Array(Type.String()),
  reference_works: Type.Optional(Type.Array(Type.Object({
    title: Type.String(),
    strengths: Type.String(),
    lessons: Type.String(),
  }))),
});

export type GenreAnalysis = Static<typeof GenreAnalysisSchema>;
