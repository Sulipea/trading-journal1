import type { z } from "zod";
import type {
  accountSettingsSchema,
  aiStatusSchema,
  appSettingsSchema,
  changeHistorySchema,
  directionSchema,
  tradeEventSchema,
  tradeEventTypeSchema,
  tradeSchema,
  tradeStatusSchema,
  trashItemSchema,
} from "./schemas";

export type { EntityId, IsoTimestamp } from "./ids";
export type { ContractSpec, InstrumentRoot } from "./instruments";

export type Direction = z.infer<typeof directionSchema>;
export type TradeStatus = z.infer<typeof tradeStatusSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type TradeEventType = z.infer<typeof tradeEventTypeSchema>;
export type TradeEvent = z.infer<typeof tradeEventSchema>;
export type ChangeHistory = z.infer<typeof changeHistorySchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;
export type AccountSettings = z.infer<typeof accountSettingsSchema>;
export type AiStatus = z.infer<typeof aiStatusSchema>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
