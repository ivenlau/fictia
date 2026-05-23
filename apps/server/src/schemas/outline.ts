import { Type, type Static } from "@sinclair/typebox";

export const SceneSchema = Type.Object({
  scene_number: Type.Number(),
  location: Type.String(),
  characters: Type.Array(Type.String()),
  purpose: Type.String(),
  events: Type.Array(Type.String()),
  emotional_arc: Type.String(),
  key_dialogue_hints: Type.Optional(Type.Array(Type.String())),
  foreshadowing: Type.Optional(Type.String()),
  weave_notes: Type.Optional(Type.Object({
    foreshadowing: Type.Optional(Type.String()),
    subplot: Type.Optional(Type.String()),
    easter_egg: Type.Optional(Type.String()),
  })),
});

export const ChapterOutlineSchema = Type.Object({
  chapter_number: Type.Number(),
  title: Type.String(),
  pov: Type.String(),
  setting: Type.String(),
  scenes: Type.Array(SceneSchema),
  word_count_target: Type.Number(),
  style_notes: Type.Optional(Type.String()),
  continuity_checkpoints: Type.Array(Type.String()),
});

export const ActOutlineSchema = Type.Object({
  act_number: Type.Number(),
  name: Type.String(),
  chapters: Type.Array(Type.Number()),
  summary: Type.String(),
});

export type ChapterOutline = Static<typeof ChapterOutlineSchema>;
export type Scene = Static<typeof SceneSchema>;
export type ActOutline = Static<typeof ActOutlineSchema>;
