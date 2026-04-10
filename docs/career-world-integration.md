# Career World Integration Notes

## New/Updated Endpoints

- `POST /api/career/socratic/start` starts a Socratic session (`topic` required).
- `POST /api/career/socratic/turn` handles one Socratic turn with grounding, citations, and safe "I don't know" fallback.
- `GET /api/career/analytics/summary` returns Career usage + learning metrics for dashboard integration.
- Existing Career endpoints now award XP through shared gamification core and increment Career daily quests:
  - `POST /api/career/attempts/submit`
  - `POST /api/career/visualizer/analyze`
  - `POST /api/career/interview/final`
  - `POST /api/career/resume/analyze`
  - `POST /api/career/resume/jd-scan`
  - `POST /api/career/resume/application-kit`
  - `POST /api/career/rooms/:roomId/submit`

## Frontend Integrations

- New Career page: `Socratic Chat` at `/career/socratic`.
- Career shell navigation now includes Socratic Chat.
- Existing Study dashboard (`/dashboard`) now includes a `Career snapshot` panel via `GET /api/career/analytics/summary`.
- Career dashboard now reads shared quests via `GET /api/gamification/quests?world=career`.

## Environment Variables

- `GEMINI_API_KEY` required for Socratic and structured AI flows.
- `GEMINI_MODEL` defaults to `gemini-2.5-flash` in backend service wrapper.
- Existing optional keys (Groq/Tavily/etc.) continue to work as before.

## Shared Gamification Design

- Shared global state (single source of truth): XP, level, streak, badges, ledger.
- World-specific layer: daily quest catalog and completion rules (`study` vs `career`).
- Career-specific quest progress is updated by Socratic turns, visualizer runs, and arena submissions.
- Study and Career remain isolated by `world` identifier while sharing progression platform data.

## Run + Verify

1. Backend: `cd backend && npm run dev`
2. Frontend: `cd frontend && npm run dev`
3. Verify:
   - `/career/socratic` start + send turns
   - `/career/visualizer` analyze run still works
   - `/career/dashboard` shows quests
   - `/dashboard` still works and now shows Career snapshot
   - `/api/gamification/quests?world=career` returns quest state
