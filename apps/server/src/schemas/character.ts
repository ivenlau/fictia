import { Type, type Static } from "@sinclair/typebox";

export const CharacterSchema = Type.Object({
  name: Type.String(),
  role: Type.String(),
  age: Type.String(),
  personality: Type.Object({
    core_traits: Type.Array(Type.String()),
    flaws: Type.Array(Type.String()),
    growth_arc: Type.String(),
  }),
  background: Type.Object({
    origin: Type.String(),
    family: Type.String(),
    secrets: Type.Optional(Type.String()),
  }),
  abilities: Type.Object({
    initial: Type.String(),
    final: Type.String(),
    unique_power: Type.Optional(Type.String()),
  }),
  motivation: Type.Object({
    surface: Type.String(),
    deep: Type.String(),
  }),
  key_relationships: Type.Array(Type.Object({
    character: Type.String(),
    dynamic: Type.String(),
  })),
});

export const RelationshipSchema = Type.Object({
  character_a: Type.String(),
  character_b: Type.String(),
  relationship_type: Type.String(),
  dynamic_arc: Type.String(),
  conflict_points: Type.Optional(Type.Array(Type.String())),
});

/**
 * Lightweight character metadata stored in YAML front-matter.
 * Used by context-extractor for fast character quick card generation.
 */
export const CharacterMetaSchema = Type.Object({
  name: Type.String(),
  role: Type.String(),
  identity: Type.String(),
  age: Type.Optional(Type.String()),
  traits: Type.Array(Type.String()),
  relationships: Type.Array(Type.String()),
  growth_arc: Type.Optional(Type.Array(Type.String())),
  language_style: Type.Optional(Type.String()),
});

export type Character = Static<typeof CharacterSchema>;
export type Relationship = Static<typeof RelationshipSchema>;
export type CharacterMeta = Static<typeof CharacterMetaSchema>;
