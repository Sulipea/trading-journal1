import type { z } from "zod";
import type {
  accountSettingsSchema,
  aiStatusSchema,
  annotationShapeSchema,
  appSettingsSchema,
  biasSchema,
  confidenceSchema,
  forecastAdherenceSchema,
  forecastContentSchema,
  forecastFieldChangeSchema,
  forecastKeyLevelSchema,
  forecastReviewSchema,
  forecastRevisionSchema,
  forecastScenarioSchema,
  forecastSchema,
  forecastTradeLinkSchema,
  findingKindSchema,
  gexRegimeSchema,
  levelInteractionSchema,
  levelPrioritySchema,
  levelReactionSchema,
  levelTypeSchema,
  marketSnapshotSchema,
  scenarioOutcomeSchema,
  assetSchema,
  changeHistorySchema,
  directionSchema,
  psychologyEntrySchema,
  psychologyPhaseSchema,
  reviewFindingSchema,
  reviewKindSchema,
  reviewSchema,
  reviewSectionSchema,
  requirableFieldSchema,
  requirementOverrideSchema,
  ruleCheckSchema,
  ruleCheckStatusSchema,
  ruleGroupSchema,
  ruleSchema,
  ruleSeveritySchema,
  setupCategorySchema,
  setupMergeHistorySchema,
  setupRuleSchema,
  setupSchema,
  screenshotAnnotationVersionSchema,
  sessionOptionSchema,
  sessionSchema,
  tradeEventSchema,
  tradeEventTypeSchema,
  tradeSchema,
  tradeScreenshotSchema,
  tradeStatusSchema,
  trashItemSchema,
} from "./schemas";

export type { EntityId, IsoTimestamp } from "./ids";
export type { ContractSpec, InstrumentRoot } from "./instruments";

export type Direction = z.infer<typeof directionSchema>;
export type TradeStatus = z.infer<typeof tradeStatusSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type SessionOption = z.infer<typeof sessionOptionSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type TradeEventType = z.infer<typeof tradeEventTypeSchema>;
export type TradeEvent = z.infer<typeof tradeEventSchema>;
export type PsychologyPhase = z.infer<typeof psychologyPhaseSchema>;
export type PsychologyEntry = z.infer<typeof psychologyEntrySchema>;
export type AnnotationShape = z.infer<typeof annotationShapeSchema>;
export type TradeScreenshot = z.infer<typeof tradeScreenshotSchema>;
export type ScreenshotAnnotationVersion = z.infer<typeof screenshotAnnotationVersionSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type ChangeHistory = z.infer<typeof changeHistorySchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type RequirableField = z.infer<typeof requirableFieldSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
export type RequirementOverride = z.infer<typeof requirementOverrideSchema>;
export type RuleSeverity = z.infer<typeof ruleSeveritySchema>;
export type RuleGroup = z.infer<typeof ruleGroupSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type SetupCategory = z.infer<typeof setupCategorySchema>;
export type Setup = z.infer<typeof setupSchema>;
export type SetupRule = z.infer<typeof setupRuleSchema>;
export type SetupMergeHistory = z.infer<typeof setupMergeHistorySchema>;
export type RuleCheckStatus = z.infer<typeof ruleCheckStatusSchema>;
export type RuleCheck = z.infer<typeof ruleCheckSchema>;
export type Bias = z.infer<typeof biasSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type GexRegime = z.infer<typeof gexRegimeSchema>;
export type LevelType = z.infer<typeof levelTypeSchema>;
export type LevelPriority = z.infer<typeof levelPrioritySchema>;
export type LevelReaction = z.infer<typeof levelReactionSchema>;
export type ForecastKeyLevel = z.infer<typeof forecastKeyLevelSchema>;
export type ForecastScenario = z.infer<typeof forecastScenarioSchema>;
export type ForecastContent = z.infer<typeof forecastContentSchema>;
export type ScenarioOutcome = z.infer<typeof scenarioOutcomeSchema>;
export type ForecastReview = z.infer<typeof forecastReviewSchema>;
export type Forecast = z.infer<typeof forecastSchema>;
export type ForecastFieldChange = z.infer<typeof forecastFieldChangeSchema>;
export type ForecastRevision = z.infer<typeof forecastRevisionSchema>;
export type MarketSnapshot = z.infer<typeof marketSnapshotSchema>;
export type LevelInteraction = z.infer<typeof levelInteractionSchema>;
export type ForecastAdherence = z.infer<typeof forecastAdherenceSchema>;
export type ForecastTradeLink = z.infer<typeof forecastTradeLinkSchema>;
export type ReviewKind = z.infer<typeof reviewKindSchema>;
export type ReviewSection = z.infer<typeof reviewSectionSchema>;
export type FindingKind = z.infer<typeof findingKindSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
