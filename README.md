# Trading Journal

A personal, local-first futures trading journal (ES, MES, NQ, MNQ) built with Next.js.
Your journal lives in your browser's IndexedDB — there is no server database and no account.
See `TRADING_JOURNAL_SPEC.md` for the full product specification and `BUILD_PLAN.md` for the phases.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
```

## Optional AI

AI features (post-close trade reviews, periodic review interpretation, pattern discovery and journal chat) are off
unless the server has an API key. Copy `.env.example` to `.env.local` and set `ANTHROPIC_API_KEY`; optionally set
`AI_MODEL` (default `claude-sonnet-5`). Then turn AI on in **Settings**.

- Keys stay on the server (`app/api/ai/route.ts`); the browser never sees them.
- Each request sends only the context for that task. Screenshots are sent only when you select them.
- AI output is stored locally, labelled (data-backed observation, interpretation, possible pattern, review question),
  and never changes your journal or makes trading decisions.

## Deploy

Push to GitHub and import the repository in Vercel. To enable AI there, add `ANTHROPIC_API_KEY` (and optionally
`AI_MODEL`) under the project's Environment Variables. Journal data still stays in each browser.
