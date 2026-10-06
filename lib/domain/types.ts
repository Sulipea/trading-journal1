import type { z } from "zod";
import type {
  accountSettingsSchema,
  aiStatusSchema,
  annotationShapeSchema,
  appSettingsSchema,
  assetSchema,
  changeHistorySchema,
  directionSchema,
  psychologyEntrySchema,
  psychologyPhaseSchema,
  requirableFieldSchema,
  screenshotAnnotationVersionSchema,
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
