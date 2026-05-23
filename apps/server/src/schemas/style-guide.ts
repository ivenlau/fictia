import { Type, type Static } from "@sinclair/typebox";

export const StyleGuideSchema = Type.Object({
  narrative_perspective: Type.Object({
    primary: Type.String(),
    secondary: Type.Optional(Type.Array(Type.String())),
  }),
  language_style: Type.Object({
    tone: Type.String(),
    sentence_preference: Type.String(),
    dialogue_style: Type.String(),
  }),
  literary_techniques: Type.Object({
    allowed: Type.Array(Type.String()),
    restricted: Type.Array(Type.String()),
    forbidden: Type.Array(Type.String()),
  }),
  pacing: Type.Object({
    battle_scenes: Type.String(),
    daily_scenes: Type.String(),
    turning_points: Type.String(),
  }),
  reference_styles: Type.Optional(Type.Array(Type.Object({
    author: Type.String(),
    aspect: Type.String(),
    example: Type.String(),
  }))),
});

export type StyleGuide = Static<typeof StyleGuideSchema>;
