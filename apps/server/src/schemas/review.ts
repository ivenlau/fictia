import { Type, type Static } from "@sinclair/typebox";

export const ReviewIssueSchema = Type.Object({
  severity: Type.Union([
    Type.Literal("critical"),
    Type.Literal("major"),
    Type.Literal("minor"),
    Type.Literal("info"),
  ]),
  location: Type.String(),
  description: Type.String(),
  suggestion: Type.String(),
});

export const ChapterReviewSchema = Type.Object({
  chapter: Type.String(),
  overall_score: Type.Number(),
  dimension_scores: Type.Object({
    literary_quality: Type.Number(),
    style_consistency: Type.Number(),
    character_consistency: Type.Number(),
    logic_consistency: Type.Number(),
    plot_effectiveness: Type.Number(),
    artistic_achievement: Type.Number(),
    narrative_weave_achievement: Type.Optional(Type.Number()),
  }),
  issues: Type.Array(ReviewIssueSchema),
  strengths: Type.Array(Type.String()),
});

export const ConsistencyIssueSchema = Type.Object({
  category: Type.String(),
  severity: Type.Union([
    Type.Literal("critical"),
    Type.Literal("warning"),
    Type.Literal("info"),
  ]),
  location: Type.String(),
  description: Type.String(),
  related_files: Type.Optional(Type.Array(Type.String())),
});

export const ForeshadowingStatusSchema = Type.Object({
  id: Type.String(),
  seed: Type.String(),
  status: Type.String(),
  expected_reveal: Type.String(),
});

export const SubplotStatusSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  status: Type.String(),
  last_activity: Type.String(),
  next_expected: Type.String(),
});

export const EasterEggStatusSchema = Type.Object({
  id: Type.String(),
  planted: Type.Boolean(),
  discovery_hint_added: Type.Optional(Type.Boolean()),
  payoff_expected: Type.Optional(Type.String()),
});

export const ConsistencyReportSchema = Type.Object({
  scan_scope: Type.String(),
  scan_date: Type.String(),
  issues: Type.Array(ConsistencyIssueSchema),
  tracked_foreshadowing: Type.Optional(Type.Array(ForeshadowingStatusSchema)),
  tracked_subplots: Type.Optional(Type.Array(SubplotStatusSchema)),
  tracked_easter_eggs: Type.Optional(Type.Array(EasterEggStatusSchema)),
  summary: Type.Object({
    critical: Type.Number(),
    warning: Type.Number(),
    info: Type.Number(),
    consistency_score: Type.Number(),
  }),
});

export type ChapterReview = Static<typeof ChapterReviewSchema>;
export type ReviewIssue = Static<typeof ReviewIssueSchema>;
export type ConsistencyReport = Static<typeof ConsistencyReportSchema>;
