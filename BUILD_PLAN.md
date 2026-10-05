# Trading Journal — Build Plan

## Phase 1
Foundation:
Next.js, TypeScript, Tailwind, UI system, routing, IndexedDB/Dexie, schema migrations, storage repositories, domain types, test infrastructure.

## Phase 2
Core trades:
Quick entry, full form, lifecycle, multiple entries/exits, ES/MES/NQ/MNQ specs, P&L/risk/R, screenshots, psychology, notes, history, trash.

## Phase 3
Rules/setups:
Setup management, checklists, rule hierarchy/severity, violations, trade quality, setup analytics, setup discovery/merge suggestions.

## Phase 4
Forecast:
Daily forecast, scenarios, key levels, GEX, market conditions, revisions, confidence, trade linkage, EOD review.

## Phase 5
Analytics:
Dashboard, calendar, equity, drawdown, filters, setup/rule/psychology/forecast analytics, hour-of-day analysis, pattern detection.

## Phase 6
Reviews:
Automatic trade review framework, weekly review, monthly review, review findings.

## Phase 7
AI:
Provider abstraction, Vercel `/api/ai`, context builder, automatic post-trade review, similar-trade comparison, journal chat, pattern discovery.

AI may remain disabled until API credentials are configured.

## Phase 8
Backup/polish:
Local automatic snapshots, manual export, restore, migrations, performance, accessibility, visual polish, E2E coverage.

## Deployment

Source:
Claude Code -> GitHub

Hosting:
GitHub -> Vercel

Journal:
Browser -> IndexedDB/OPFS

AI:
Browser -> Vercel `/api/ai` -> configured AI provider
