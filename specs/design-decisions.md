# Design Decisions

## Architecture

### Monorepo with split deployment

- **Frontend** on Vercel, **backend** on Render — chosen for free-tier hosting and simple CI from GitHub.
- Frontend calls backend via `VITE_API_BASE`; no server-side proxy in production.
- CORS restricted to the Vercel origin in production via `Cors__AllowedOrigins`.

### SQLite on Render

- Single-file SQLite at `/app/data/learnchain.db` keeps ops simple for a coursework project.
- `DatabaseMigrator` uses `EnsureCreated` plus manual column/table patches for backward-compatible schema evolution without formal EF migrations.

### JWT authentication

- Stateless Bearer tokens; frontend stores token + user snapshot in `localStorage`.
- Passwords hashed with BCrypt on the server.

---

## Frontend

### State management (Zustand)

- `habitStore` — habits, login, check-in state
- `settingsStore` — theme (day/night) + language via 4-corner toggle
- `achievementStore` — profile, badges, unlock queue

Kept separate to avoid one oversized store and to match feature boundaries.

### Theming

- CSS custom properties in `chain-summit.css` with `.app-shell.theme-day` overrides.
- Theme tied to locale corner (e.g. top-left = 中文 + day) for a single control.

### Habit calendar (dashboard)

- Month grid built client-side from habits + full check-in history.
- Due-date rules mirror backend `HabitDueService` so calendar matches actual check-in eligibility.
- Completed items use strikethrough + slide animation for feedback without extra API calls.

### Achievements

- 26 badges defined in frontend (`badgeDefinitions.ts`) with PNG assets.
- Unlock logic runs on the **backend** (`AchievementService`) so progress cannot be faked from the client.
- New unlocks returned in login, check-in, and habit-create responses; UI shows a modal queue.

---

## Backend

### Habit due logic

Centralized in `HabitDueService`:

| Type | Rule |
|------|------|
| Daily | Due unless already checked today |
| EveryOtherDay | Due if never checked, or ≥2 days since last check |
| Weekly | Due if never checked, or ≥7 days since last check |
| OneTime | Due on milestone dates or final due date |

### Achievement triggers

Evaluated after login, check-in, and habit creation. Examples:

- **first_step** — ≥1 active habit
- **streak_7** — max current streak ≥7 on any habit
- **total_100** — ≥100 lifetime check-ins
- **early_bird** — 7 consecutive days with check-in before 09:00 UTC

Full list in `AchievementService.cs` / `badgeDefinitions.ts`.

---

## Deployment

### Docker build context

- Render clones the **repo root**; `backend/Dockerfile` copies `backend/backend.csproj` accordingly (not `backend.csproj` at root).

### Connection string

- Use `DataSource=/path` (no space) in env vars to avoid Docker/Render parsing issues.

---

## Internationalization

- Single `translations.ts` file with `zh` / `en` keys.
- `useTranslation()` hook reads active language from settings store.
