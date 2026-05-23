import { Type, type Static } from "@sinclair/typebox";

export const ForeshadowingSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  seed: Type.Object({
    chapter: Type.Number(),
    scene: Type.String(),
    method: Type.String(),
    text_hint: Type.Optional(Type.String()),
  }),
  trigger: Type.Optional(Type.Object({
    chapter: Type.Number(),
    method: Type.String(),
  })),
  reveal: Type.Object({
    chapter: Type.Number(),
    method: Type.String(),
    impact: Type.String(),
  }),
  linked_characters: Type.Array(Type.String()),
  linked_world_rules: Type.Optional(Type.Array(Type.String())),
  thematic_connection: Type.Optional(Type.String()),
});

export const SubplotSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  theme: Type.String(),
  chapters: Type.Array(Type.Number()),
  start_chapter: Type.Number(),
  end_chapter: Type.Number(),
  resolution_method: Type.String(),
  linked_characters: Type.Array(Type.String()),
  main_plot_intersection: Type.Array(Type.Object({
    chapter: Type.Number(),
    event: Type.String(),
  })),
  emotional_arc: Type.String(),
  thematic_echo: Type.Optional(Type.String()),
});

export const EasterEggSchema = Type.Object({
  id: Type.String(),
  type: Type.String(),
  location: Type.String(),
  content: Type.String(),
  reference: Type.Optional(Type.String()),
  hidden_meaning: Type.Optional(Type.String()),
  reader_reward: Type.Optional(Type.String()),
  discovery_difficulty: Type.Optional(Type.String()),
});

export const WeaveScheduleEntrySchema = Type.Object({
  chapter: Type.Number(),
  foreshadowing: Type.Array(Type.String()),
  subplot_activity: Type.Array(Type.String()),
  easter_eggs: Type.Array(Type.String()),
});

export const NarrativeWeaveSchema = Type.Object({
  foreshadowing: Type.Array(ForeshadowingSchema),
  subplots: Type.Array(SubplotSchema),
  easter_eggs: Type.Array(EasterEggSchema),
  weave_schedule: Type.Array(WeaveScheduleEntrySchema),
});

export type NarrativeWeave = Static<typeof NarrativeWeaveSchema>;
export type Foreshadowing = Static<typeof ForeshadowingSchema>;
export type Subplot = Static<typeof SubplotSchema>;
export type EasterEgg = Static<typeof EasterEggSchema>;
