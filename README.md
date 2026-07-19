# LearnChain

Gamified personal habit tracker — React + .NET 10 (MSA 2026 Phase 2).

Build lasting habits through check-ins, streaks, XP, levels, achievements, and a visual habit calendar.

## Live Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Frontend** | [https://learnchain-msa2026.vercel.app](https://learnchain-msa2026.vercel.app) | Vercel (React + Vite) |
| **Backend API** | [https://learnchain-msa2026.onrender.com](https://learnchain-msa2026.onrender.com) | Render (Docker + .NET 10) |
| **Health Check** | [https://learnchain-msa2026.onrender.com/health](https://learnchain-msa2026.onrender.com/health) | Returns `{ "status": "healthy" }` |

> The backend root URL returns 404 — that is expected. The API lives under `/api/*` and `/health`.

### Environment (Production)

**Vercel** — set in project settings:

```
VITE_API_BASE=https://learnchain-msa2026.onrender.com/api
```

**Render** — key variables:

| Variable | Value |
|----------|-------|
| `ConnectionStrings__DefaultConnection` | `DataSource=/app/data/learnchain.db` |
| `JWT_KEY` | (random secret) |
| `Cors__AllowedOrigins` | `https://learnchain-msa2026.vercel.app` |

---

## Features

- **Habit tracking** — Daily, every-other-day, weekly, and one-time habits with milestones
- **Gamification** — XP, levels, streaks, 26 achievement badges
- **Dashboard calendar** — Large month view showing due check-ins per day; completed items strike through
- **Profile & motivation** — Personal bio quotes scroll on the dashboard
- **Themes** — Day / night mode + Chinese / English (4-corner toggle)

---

## Gamification Theme

LearnChain's core theme is **gamification** — it turns the boring, high-friction task of building habits into a game loop that rewards consistency:

- **Chains, not checkboxes.** Every habit is a "chain" you keep alive by checking in. Missing a day breaks the streak, which creates the same "don't break the chain" pressure that makes habit games addictive.
- **XP, levels, and streaks.** Each check-in awards XP; XP rolls up into levels. Streaks track current and longest runs so progress feels visible and worth protecting.
- **26 achievement badges.** Milestones (first check-in, 7-day streak, level 5, N total check-ins, etc.) unlock badges server-side, with unlock popups and a locked/unlocked gallery.
- **Feedback everywhere.** A month calendar shows what's due and strikes through completed items; a motivational quote ticker keeps the user's own "why" in front of them.

The goal is to make the *reward* for showing up immediate and tangible, so habit-building feels like leveling up a character rather than doing chores.

## What's Unique / Worth a Look

A few things markers may find interesting:

- **4-corner theme + language toggle.** A single control in each screen corner switches both **day/night theme** and **English/Chinese** at once (bottom-left = 中文/夜间, top-right = English/day, etc.). Choice persists in `localStorage` and is applied via `data-theme` / `data-lang` attributes on `<html>` — see `frontend/src/components/ThemeLocaleToggle.tsx` and `frontend/src/stores/settingsStore.ts`.
- **Fully bilingual UI** driven by a typed i18n dictionary (`frontend/src/i18n/translations.ts`), not just labels — including motivational content.
- **Server-authoritative achievements.** Badge unlocks are evaluated on the backend (`AchievementService`) on login and via an explicit sync endpoint, so they can't be spoofed from the client.
- **Docker-first, resilient deploy.** SQLite connection-string parsing tolerates dashboard-mangled env vars, and the Dockerfile disables inotify file-watching to survive Render's shared-host limits.

---

## Advanced Features (Phase 2)

Per the MSA 2026 Phase 2 brief, the **three** advanced features chosen for marking are:

| # | Advanced Feature (from official list) | Status | Where to verify |
|---|---------------------------------------|--------|-----------------|
| 1 | **State management library (Zustand)** | ✅ Done | `frontend/src/stores/` — `habitStore`, `settingsStore`, `achievementStore`, `languageStore` |
| 2 | **Theme switching (light/dark mode)** | ✅ Done | `frontend/src/stores/settingsStore.ts`, `frontend/src/components/ThemeLocaleToggle.tsx` — day/night + EN/中文 |
| 3 | **Dockerize the project using Docker** | ✅ Done | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `render.yaml` |

> A fourth advanced feature — **Security Measures** — is also implemented (BCrypt password hashing, input validation/sanitisation, JWT + `[Authorize]`). It is documented below as a bonus but the three above are the ones nominated for marking.

### 1. State Management (Zustand)

**Why it matters:** Auth state, habits, settings, and achievements are needed across many unrelated screens. Prop-drilling or duplicating `useState` would cause stale data and re-render bugs. A central store keeps a single source of truth and lets any component subscribe to just the slice it needs.

**How it's implemented:**

- Multiple focused stores under `frontend/src/stores/`:
  - `habitStore.ts` — habits, check-ins, streaks, and optimistic updates
  - `settingsStore.ts` — theme + language + corner toggle
  - `achievementStore.ts` — unlocked badges and unlock popups
  - `languageStore.ts` — kept as a backward-compatible alias of the settings store
- Stores are created with `create<State>()` and selected with fine-grained selectors (e.g. `useSettingsStore(s => s.language)`) to minimise re-renders.
- State that must survive reloads (theme/language corner) is persisted to `localStorage` inside the store actions.

### 2. Theme Switching (Light / Dark Mode)

**Why it matters:** A habit app is opened daily, often at night. A dark ("night") theme reduces eye strain and respects user preference, and pairing it with language choice makes the app usable for both English and Chinese speakers.

**How it's implemented:**

- `settingsStore` maps a chosen corner to a `{ theme, language }` pair and writes `data-theme="day|night"` and `data-lang="en|zh"` onto `document.documentElement`.
- CSS is driven by those attributes, so theming is a single attribute swap with no component re-mounting.
- The selected theme/language persists across sessions via `localStorage` and is re-applied on load.
- Verify: run the frontend, use the corner toggle (`ThemeLocaleToggle`) to switch between day/night and EN/中文.

### 3. Dockerization

**Why it matters:** Containerizing both services makes the app reproducible ("works on my machine" → "works everywhere"), enables one-command local startup, and is what actually powers the Render deployment.

**How it's implemented:**

- `backend/Dockerfile` — multi-stage .NET 10 build (SDK build stage → slim ASP.NET runtime), with a `/health` HEALTHCHECK and inotify-safe env vars for Render's shared hosts.
- `frontend/Dockerfile` — builds the Vite SPA and serves the static bundle.
- `docker-compose.yml` — brings up frontend + backend together for local full-stack testing (`docker compose up --build`).
- `render.yaml` — Render blueprint that deploys the backend Docker image.

### Bonus: Security Measures

Although not one of the three nominated features, the app implements several security measures (the brief's "at least 2" advanced security option):

- **Password hashing (BCrypt).** Passwords are never stored in plaintext — `BCrypt.Net.BCrypt.HashPassword` on register/change-password and `Verify` on login (`backend/Controllers/UserController.cs`).
- **Data validation & sanitisation.** Registration/login validate and normalise input: required fields, email-format regex, lower-casing + trimming, and uniqueness checks for username and email.
- **JWT authentication + authorization.** Protected endpoints require a valid Bearer token via `[Authorize]`, with signing-key, issuer, audience, and lifetime validation configured in `Program.cs`.

### Also present: Scalar API Reference (Basic requirement)

The project also uses **Scalar** (instead of Swagger UI) for interactive API docs. This is part of the Basic requirements rather than an advanced feature, but is available locally:

- Registered in `Program.cs` (`AddOpenApi()` + `MapScalarApiReference()`), Development only.
- Local UI: [http://localhost:5000/scalar/v1](http://localhost:5000/scalar/v1); OpenAPI JSON at `/openapi/v1.json`.

---

## Quick Start (Docker)

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend | http://localhost:5000 |
| Health | http://localhost:5000/health |

Stop: `docker compose down`

---

## Local Development

**Backend**

```bash
cd backend
dotnet run
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Local API defaults to `/api` via Vite proxy. Override with `VITE_API_BASE=http://localhost:5000/api`.

---

## Tests

```bash
# Backend
cd backend.Tests && dotnet test

# Frontend
cd frontend && npm test
```

---

## Project Structure

```
learnchain-msa2026/
├── backend/              # .NET 10 Web API (SQLite, JWT)
├── backend.Tests/        # xUnit tests
├── frontend/             # React + Vite + Zustand + Tailwind
├── specs/                # Design docs, AI usage notes, decisions
├── docker-compose.yml
├── render.yaml           # Render deployment blueprint
└── README.md
```

---

## Documentation

See the [`specs/`](./specs/) folder:

- [Design decisions](./specs/design-decisions.md)
- [AI usage notes](./specs/ai-usage.md)
- [Prompt archive](./specs/prompts.md)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Zustand, React Router, Tailwind CSS 4 |
| Backend | ASP.NET Core 10, EF Core, SQLite, JWT Bearer |
| Deploy | Vercel (frontend), Render (backend Docker) |

---

## Self-Reflection

*If I were to do this project again, what would I do differently?*

- **Persist data in a real database.** SQLite on Render's ephemeral disk means data can be lost on redeploy. Next time I'd use Postgres (or a Render persistent disk from day one) so user progress is durable — especially important for a habit app where losing streaks is a dealbreaker.
- **Design the API contract first.** Some DTOs and endpoints evolved reactively as the frontend needed them, which caused a few mismatches. Writing an OpenAPI-first contract before coding would have reduced rework and kept naming consistent between client and server.
- **Add end-to-end tests earlier.** I have backend xUnit tests and some frontend store/component tests, but no full-flow (register → create habit → check in → unlock badge) coverage. Adding these earlier would have caught integration bugs that only surfaced during manual testing.
- **Move theme/language state into a persisted store middleware.** The current stores manually read/write `localStorage`. Using Zustand's `persist` middleware would remove that boilerplate and centralise hydration logic.
- **Harden production config sooner.** Issues like the Render inotify limit and CORS/connection-string edge cases were fixed reactively. I'd bake a production checklist (env vars, health checks, file-watcher settings) into the deploy setup from the start.
- **Improve accessibility.** The 4-corner toggle is a fun idea but isn't obvious to first-time users and lacks keyboard/ARIA affordances. I'd add clearer labels and separate, accessible controls for theme and language.

---

## License

MSA 2026 coursework project.
