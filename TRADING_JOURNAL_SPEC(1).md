# Trading Journal — Claude Code Master Specification

## 1. Product

Build a personal, desktop/laptop-first futures trading journal web application.

Purpose:
- log every trade and its context
- analyze performance and mistakes
- improve discipline, forecasting, process and review
- discover recurring patterns
- provide AI analysis without letting AI modify data or make trading decisions

Workflow:
Claude Code -> GitHub -> Vercel

No VS Code. No Claude Artifacts.

## 2. Core architecture

- Next.js + React + TypeScript
- Tailwind CSS
- modern accessible component library such as shadcn/ui
- IndexedDB for journal data, preferably through Dexie
- OPFS and/or IndexedDB for large local assets/backups
- Zod for validation
- Vitest for unit tests
- Playwright for important E2E flows
- Vercel for hosting
- GitHub for source code

The journal is single-user and local-first.

There is no login/account in V1.
There is no server-side journal database.
GitHub stores source code only.
Vercel hosts the application and can run AI API functions, but must not persist journal data.

Keep the storage layer behind an abstraction so a future native/Tauri filesystem implementation is possible.

## 3. Explicitly excluded from V1

Do not build:
- broker integration
- TradingView integration
- cloud journal sync
- mobile app
- multi-user accounts
- social features
- trade execution
- automated market-data ingestion
- broker CSV import
- slippage tracking
- MFE/MAE
- consecutive win/loss streak analytics
- daily loss-limit system
- screenshot support inside forecasts

The architecture should remain extensible for future additions.

## 4. Navigation

Sidebar:
- Dashboard
- Trades
- Calendar
- Forecasts
- Setups
- Rules
- Analytics
- Reviews
- Settings

Always-visible prominent `+ New Trade` action.

Visual direction:
- polished modern SaaS dashboard
- clean professional typography
- cards and charts
- subtle animation
- information-dense but readable
- not spreadsheet-like

## 5. Dashboard

Keep it minimal:
- today's trades
- today's P&L
- key statistics
- current equity
- current drawdown
- concise performance snapshot
- useful recent review findings

Detailed analysis belongs in Analytics.

## 6. Trade model

A trade is one position from first entry until completely closed.

A trade can contain multiple entries and multiple exits.

Lifecycle:
OPEN -> UPDATED -> CLOSED

Only closed trades count toward performance statistics.

Trade workspace should show one trade with a chronological event timeline.

### Quick entry

Immediately require:
- exact contract symbol
- Long/Short
- entry price
- contracts

Other information can remain blank temporarily.

When closing:
- all required fields must be complete
- remind user about missing information
- do not allow an incomplete closed trade

### Full trade sections

Use collapsible sections:
1. Market data
2. Trade reasoning
3. Forecast/context
4. Setup
5. Risk
6. Psychology
7. Execution
8. Screenshots/chart analysis
9. Notes
10. Rules/checklist

Required fields are configurable globally and per setup.

A setup determines required fields. A user may override/skip a setup requirement only with a reason; that override is tracked as a process/rule violation.

## 7. Futures

V1 supports:
- ES
- MES
- NQ
- MNQ

Use built-in contract specifications.

The user manually enters the exact contract symbol, e.g. `ESZ6`.

Explicit direction:
- Long
- Short

Manually enter:
- contracts
- planned entry
- planned stop
- planned target
- fees/commissions

Calculate planned risk from contract specification, contracts, entry and stop.

No currency conversion system is needed for V1.

## 8. Entries/exits

Each fill/event stores:
- event type
- price
- quantity
- timestamp
- reason
- optional notes

Display all events in a timeline.

The user does NOT want:
- slippage tracking
- stop-change timeline
- TP-change timeline
- MFE/MAE

Store final SL/TP.

Trade duration = first entry to final exit. Display it, but do not use duration in analytics.

## 9. Financial calculations

Implement deterministic, tested calculation services for:
- gross profit
- gross loss
- fees
- net P&L
- P&L percentage where meaningful
- R multiple
- initial planned risk
- actual/max risk
- planned risk/reward
- win/loss
- average win
- average loss
- expectancy
- profit factor
- equity curve
- current drawdown
- maximum drawdown

1R is the initial planned risk and never changes.

Final P&L reconciliation uses actual realized prices, all partial entries/exits, quantities, direction, contract specification and fees.

Also compare planned vs actual:
- risk
- size
- entries
- exits
- fees

Do not use an LLM for financial calculations.

## 10. Account/equity

User manually enters starting balance.

Equity:
`starting balance + closed-trade net P&L`

Track:
- equity curve
- current drawdown
- maximum drawdown

No daily loss limits in V1.

No consecutive streak analytics.

## 11. Trade quality

Automatically calculate trade quality using:
- rule adherence
- execution
- risk management
- process/outcome alignment

Do not equate outcome with quality.

A losing trade can be high quality and a winning trade can be low quality.

Analyze quality vs outcome.

## 12. Psychology

Capture psychology:
- before trade
- during trade
- after trade

Use:
- predefined emotions
- ratings
- free text

Analyze:
- common emotions
- emotions vs P&L
- emotions vs quality
- emotions vs rule adherence
- psychology vs setup/session/conditions
- recurring behavioral patterns

## 13. Screenshots

Allow unlimited screenshots per trade.

Screenshots can be added at any point.

Support:
- thumbnails
- full-screen viewer
- zoom/pan
- annotations
- multiple annotated versions/stages

Store locally.

Do not require TradingView.

Only explicitly selected screenshots are sent to AI.

## 14. Trade editing/history

Trades remain editable.

Keep internal change history.

Important fields lock after close, but user can manually unlock.

Record:
- timestamp
- field changed
- old value
- new value

## 15. Trash

Deleting a trade moves it to a recycle bin.

Restore is possible.

Permanent deletion requires a second confirmation.

## 16. Setups

Setups are first-class entities with:
- description
- checklist/rules
- required/optional fields
- statistics
- historical trades
- rule-level analysis

Support:
- predefined categories
- custom tags
- automatic categorization where useful
- recurring setup discovery

When enough data exists, suggest potential new setups with:
- description
- supporting trades
- performance statistics

Never create automatically.

Detect possible duplicate setups and suggest merging.

For merges:
- preserve original names/history
- future trades can use the merged setup
- historical analytics must not be rewritten

## 17. Rules

Rules have:
- name
- description
- severity
- customizable hierarchy/group
- required/optional
- active/inactive

Severity:
- Low
- Medium
- High

High-severity violation:
- requires acknowledgment
- requires reason
- automatically flags the trade for review

Before save:
- warn on violations
- require acknowledgment where necessary
- require explanation where necessary

Analytics:
- violation frequency by rule
- violating vs following P&L
- violating vs following trade quality

## 18. Analytics

Filters:
- date
- instrument
- Long/Short
- setup
- session
- day
- psychology
- rule adherence
- trade quality

Time ranges:
- Today
- This week
- This month
- This year
- All time

Analyze:
- P&L
- R
- win rate
- average win/loss
- expectancy
- profit factor
- equity
- drawdown
- setup
- instrument
- session
- hour of day
- day of week
- direction
- psychology
- rules
- trade quality
- market conditions
- forecast adherence

Always show sample size.

Do not present tiny-sample coincidences as facts.

## 19. Calendar

Calendar shows:
- daily P&L
- trade count
- performance intensity/indicator

Click a day to see that day's trades.

## 20. Pattern detection

Only surface patterns when sufficient data exists.

Every pattern must:
- be labeled as a potential pattern/correlation
- show supporting trades
- show underlying statistics
- allow drilling into evidence
- optionally feed into weekly/monthly reviews

Never imply causation merely from correlation.

## 21. Forecast system

Forecasting is a dedicated system.

Forecast contains:
- bullish/bearish/neutral bias
- market conditions
- expected scenarios
- setups
- key levels/zones
- invalidation
- GEX regime
- numeric GEX value
- confidence
- optional numeric confidence score
- free text

No screenshots in forecasts.

GEX regime and numeric value are entered manually.

## 22. Scenarios

A forecast supports multiple scenarios.

Each scenario has:
- IF
- THEN
- INVALIDATION

Each can contain:
- instruments
- setups
- key levels

Scenarios may apply to any combination of supported instruments.

## 23. Forecast key levels

Key levels can be:
- global
- instrument-specific
- multi-instrument

Store:
- price
- label/type
- significance/priority
- expected reaction
- associated scenario
- interaction status
- actual outcome

Interaction supports:
- automatic touch detection where possible
- manual outcome
- reaction
- continuation
- rejection
- break
- notes
- links to scenario/trades

Analyze level types and reactions over time.

## 24. Market-condition snapshots

During the day, allow manual market-condition snapshots.

Snapshots preserve the full timeline and can modify the active forecast context.

## 25. Forecast revisions

Workflow:
1. Create daily forecast.
2. Explicitly finalize it.
3. Use `Create Revision` to revise.
4. Record why it changed.
5. Preserve the previous revision.
6. New revision becomes active.

Store:
- timestamp
- exact field changes
- reason
- active revision

Compare original/revisions to eventual outcome.

Evaluate whether revisions improved the forecast.

## 26. Confidence

Confidence:
- Low
- Medium
- High
- optional numeric score

Track historically.

Analyze calibration by:
- scenario
- setup
- condition

Detect overconfidence and underconfidence.

## 27. Forecast-to-trade workflow

Each trade links to exactly:
- one forecast
- one scenario

Ask:
`Did this trade follow your forecast?`

Answers:
- Yes
- Partially
- No

Partially/No requires a reason and creates a deviation record.

If a trade was not forecast:
- mark Unplanned
- require reason
- flag deviation
- compare planned vs unplanned performance

Evaluate the trade against the forecast revision active when it was taken.

Also show whether it followed the latest forecast available at that time.

## 28. Forecast accuracy vs execution

Keep these as separate analyses.

Forecast accuracy:
Did the expected market scenario/conditions occur?

Execution against forecast:
Did the trader execute according to the forecast?

No combined score.

## 29. End-of-day forecast review

Show:
- forecast/revision timeline
- actual market outcome
- scenario outcomes
- trades mapped to forecast/scenario
- forecast accuracy
- execution against forecast
- deviations

Lock forecast after the day. Manual reopen is allowed.

## 30. Reminders

Support configurable reminders for:
- start of day
- end of day
- opening/creating a trade
- other configurable events

## 31. Reviews

Automatically generate weekly/monthly reviews.

Sections:
- performance
- mistakes/rules
- psychology
- forecast accuracy
- execution
- setups
- market conditions

Each section can expand.

User can mark findings important.

Do not create a separate Lessons/Insights database in V1. Important findings remain attached to the review.

## 32. AI

AI can:
- analyze completed trades
- automatically review closed trades
- perform periodic reviews
- provide freeform journal chat
- answer dedicated analytical queries
- compare similar historical trades
- identify potential patterns
- suggest potential setups
- identify potential duplicate setups
- analyze screenshots when explicitly supplied
- explain data relationships
- generate review questions

AI must never:
- modify journal data
- modify rules
- modify setups
- modify forecasts
- delete data
- place trades
- make trading decisions

AI output must distinguish:
- DATA-BACKED OBSERVATION
- INTERPRETATION
- POSSIBLE PATTERN/CORRELATION
- REVIEW QUESTION

Analytical claims must show supporting trades/data.

### Similar-trade comparison

Compare trades using:
- setup
- market conditions
- forecast/scenario
- psychology
- rule adherence

Show:
- similar trades
- similarities
- differences
- outcomes/statistics
- underlying trade references

### Automatic post-close review

When a trade closes, generate an AI review if AI is enabled.

Cover:
- summary
- rule violations
- forecast adherence
- psychology
- execution
- quality vs outcome
- similar historical trades
- review questions

Save AI output locally.

If AI is unavailable, the trade still saves normally.

## 33. AI backend

Browser:
`selected local context -> Vercel /api/ai`

Server:
`/api/ai -> configured AI provider`

Never expose API secrets client-side.

Use an AI provider abstraction, e.g.:

```text
lib/ai/provider.ts
lib/ai/context-builder.ts
lib/ai/prompts.ts
lib/ai/schemas.ts
app/api/ai/route.ts
```

Validate AI responses with Zod.

Do not persist journal data on the server.

Send only relevant context, not the entire journal by default.

AI should be optional:
- Not configured
- Configured
- Enabled
- Disabled

Core application must work with AI disabled.

A Claude Pro subscription must NOT be assumed to include programmatic API access for the deployed app.

## 34. Data model

Use versioned IndexedDB schema.

At minimum model:

- Trade
- TradeEvent
- TradeScreenshot
- ScreenshotAnnotationVersion
- Forecast
- ForecastRevision
- ForecastScenario
- ForecastKeyLevel
- MarketConditionSnapshot
- ForecastTradeLink
- Setup
- SetupRule
- SetupMergeHistory
- Rule
- RuleGroup
- RuleViolation
- PsychologyEntry
- Review
- ReviewFinding
- AIReview
- AIConversation
- AIMessage
- AccountSettings
- AppSettings
- BackupMetadata
- ChangeHistory
- TrashItem

Every entity needs stable IDs and timestamps.

Do not treat cached calculated values as the only source of truth.

## 35. Backups

Support:
- manual backups
- automatic local backups

Use IndexedDB/OPFS for local snapshots.

Optionally support a user-granted File System Access API backup destination where available.

Manual export should create a portable backup file.

Backup should include:
- journal data
- schema version
- metadata
- screenshot assets if included
- version/checksum metadata

Restore replaces the current journal completely.

Require confirmation.

Validate the backup before activation.

## 36. Settings

Include:
- starting balance
- timezone/date settings
- global required fields
- setup management
- rule hierarchy/severity
- psychology configuration
- forecast defaults
- reminders
- AI controls
- backup settings
- export/restore

## 37. Performance

Support large personal journals.

Use:
- indexed queries
- pagination/virtualization
- thumbnail screenshots
- lazy full-resolution images
- memoized/background calculations where useful

Do not load every screenshot into memory.

Do not send the entire journal to AI.

## 38. Accessibility

Use:
- semantic labels
- keyboard navigation
- visible focus
- accessible dialogs
- adequate contrast
- accessible chart summaries where practical
- never rely only on color

## 39. Testing

Test calculations:
- long
- short
- partial entries
- partial exits
- fees
- R
- risk
- equity
- drawdown
- expectancy
- profit factor

Test:
- quick entry
- close validation
- editing/unlocking
- trash/restore
- rules/violations
- forecasts/revisions
- trade linkage
- local persistence
- backups/restores
- migrations
- AI-disabled behavior
- AI provider failures
- AI response validation

## 40. Implementation phases

Phase 1: foundation
- Next.js/TypeScript/Tailwind
- UI shell/navigation
- IndexedDB/Dexie
- schema/migrations
- repository abstraction
- domain types
- tests

Phase 2: core trades
- quick entry
- full trade form
- lifecycle
- entries/exits
- futures specs
- calculations
- screenshots
- psychology
- notes
- change history
- trash

Phase 3: setups/rules
- setups
- checklists
- rules
- severity
- violations
- quality
- analytics
- discovery/merge suggestions

Phase 4: forecast
- daily forecast
- scenarios
- levels
- GEX
- conditions
- revisions
- confidence
- trade links
- EOD review

Phase 5: analytics
- dashboard
- calendar
- filters
- equity/drawdown
- setup/rule/psychology/forecast analytics
- patterns

Phase 6: reviews
- trade review framework
- weekly review
- monthly review

Phase 7: AI
- provider abstraction
- /api/ai
- context builder
- automatic trade review
- similar-trade analysis
- chat
- pattern discovery

Phase 8: backup/polish
- local automatic backups
- manual export
- restore
- migrations
- performance
- accessibility
- visual polish
- E2E tests

## 41. Claude Code behavior

Treat this specification as the product contract.

Do not invent major requirements.

Do not remove requirements because they are inconvenient.

Choose the simplest implementation consistent with the specification.

Keep business logic out of React components.

Test financial calculations.

Keep AI isolated.

Keep journal data local.

Never commit secrets or personal journal data.

Use small logical commits.

After meaningful changes:
- typecheck
- lint
- unit tests
- relevant E2E tests

Do not implement everything in one giant change.

Start with the foundation and work phase by phase.

## 42. Definition of done

The user can:
- create quick trades
- complete them later
- add partial entries/exits
- upload and annotate screenshots
- record psychology
- use setups/rules
- receive violation warnings
- close only complete trades
- see accurate P&L/R/risk/fees
- see equity/drawdown
- browse trades and calendar
- filter analytics
- create/revise forecasts
- link trades to forecasts/scenarios
- review forecast vs actual
- receive weekly/monthly reviews
- use AI when configured
- see evidence behind AI claims
- keep journal data locally
- back up and restore
- continue using the core app when AI is unavailable
