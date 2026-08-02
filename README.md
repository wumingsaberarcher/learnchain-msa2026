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

**Vercel** — set in project settings (recommended: same-origin proxy, avoids CORS):

```
VITE_API_BASE=/api
```

`frontend/vercel.json` rewrites `/api/*` → Render.  
Alternatively you may set `VITE_API_BASE=https://learnchain-msa2026.onrender.com/api` (cross-origin; backend must send CORS headers).
**Render** — key variables:

| Variable | Value |
|----------|-------|
| `ConnectionStrings__DefaultConnection` | **Internal Database URL** from Render Postgres (not SQLite path) |
| `JWT_KEY` | (random secret) |
| `Cors__AllowedOrigins` | `https://learnchain-msa2026.vercel.app` |
| `Brevo__ApiKey` / `Brevo__FromEmail` / `Brevo__FromName` | Email (HTTPS) for password reset |
| `Smtp__*` | Optional local SMTP only — **blocked on Render free** |
| `Admin__Username` / `Admin__Email` / `Admin__Password` | Sole admin bootstrap (your account only; see below) |

### Admin RBAC (sole owner)

On startup the backend creates/syncs **one SuperAdmin** from env vars (your Cipher account). Normal registration always gets `Role=User`. You can grant **regular Admin** in the admin UI; those stay Admin across redeploys. Other accidental SuperAdmins are demoted to Admin.

| Variable | Rules |
|----------|-------|
| `Admin__Username` | 3–20 English letters (e.g. `Cipher`) |
| `Admin__Email` | Valid email |
| `Admin__Password` | 8–64 letters + digits |

After setting these on Render, redeploy, then **log in again** so the JWT includes `SuperAdmin`. The admin UI is at `/admin`.

| Role | Capabilities |
|------|----------------|
| **SuperAdmin** | Everything below + grant/revoke Admin + view password vault & full account dossier + set passwords; can manage regular Admins |
| **Admin** | List/search users, set XP, grant/revoke badges, ban (1h–30d), delete users — **cannot** touch staff accounts or see passwords |
| **User** | Normal app access |

Password vault: login still uses BCrypt; a SuperAdmin-only vault is synced on register / login / password change so Cipher can reveal credentials. Existing accounts populate the vault on their next successful login (or when SuperAdmin sets a password).


### Render PostgreSQL (recommended)

Create a **Free** Postgres in the **same region** as the web service (Oregon), then point the backend at it so data survives redeploys.

**Create form values:**

| Field | Suggested value |
|-------|-----------------|
| Name | `learnchain-db` |
| Project | same as your backend |
| Region | **Oregon (US West)** (match existing service) |
| PostgreSQL Version | 16 or 18 (default OK) |
| Instance | **Free** |
| Database / User | leave random, or `learnchain` / `learnchain` |

After create:

1. Open the DB → **Connections** → copy **Internal Database URL** (starts with `postgres://…`).
2. Backend service → **Environment** → set `ConnectionStrings__DefaultConnection` = that Internal URL (replace any old SQLite `DataSource=…` value).
3. Redeploy the backend. Logs should show `[LearnChain] Database provider: Postgres`.
4. Register a new user and confirm data remains after restart.

`render.yaml` already declares `learnchain-db` and wires `ConnectionStrings__DefaultConnection` via `fromDatabase` for blueprint deploys.

> Local `dotnet run` / docker-compose still default to **SQLite** for easy coursework. Production on Render uses **PostgreSQL**.

> Free Render Postgres may be deleted after ~30 days of inactivity — poke the app before demos.

---

## Features

- **Habit tracking** — Daily, every-other-day, weekly, and one-time habits with milestones
- **Gamification** — XP, levels, streaks, 26 achievement badges
- **Dashboard calendar** — Large month view showing due check-ins per day; completed items strike through
- **Profile & motivation** — Personal bio quotes scroll on the dashboard
- **Themes** — Day / night mode + Chinese / English (4-corner toggle)
- **AI companion (Canal)** — Layered 2D character with emotions (`normal` / `smile` / `angry` / `sorrow` / `surprise` / `fear`); floating chat (text + continuous voice) that can read account/habits, create/rename/delete habits, and email today’s reminder (user’s own OpenAI-compatible API key)
- **Galgame-style dialogue** — Click Canal’s avatar for smoke transition → fullscreen left portrait + typewriter dialogue with per-clause emotion timeline
- **Companion memory** — Short-term chat history, rolling summary, and long-term memories (managed in Profile)
- **Focus Mode** — Timed lock-in from a habit with optional BGM and focus-bonus XP on successful check-in
- **Music** — Built-in BGM (some tracks unlock with all badges) + local user uploads via IndexedDB
- **Admin RBAC** — SuperAdmin / Admin user management (XP, badges, ban, roles)

---

## AI Companion, Chat & Email

1. **Profile → AI Assistant Settings** — paste your API key (defaults: OpenAI `https://api.openai.com/v1` + `gpt-4o-mini`). Key is stored in the browser only and sent with each chat request; the server does not persist it.
2. Open the floating companion (bottom-right) after login:
   - **Small panel** — text + mic (continuous listen until you stop; volume bars while speaking)
   - **Fullscreen Galgame** — first hover on Canal’s avatar (once) shows surprise; click enters smoke → left half-body sprite + bottom dialogue. Hover/click the red **Exit** button for a farewell line, then leave.
3. Habit **write** tools: `create_habit` / `rename_habit` / `delete_habit` (soft-delete). **Read** tools: account overview, today’s status, list habits. Email tool: `send_today_reminder`.
4. The companion **cannot** check in for you or change difficulty after create (XP is difficulty tiers 10 / 20 / 30).
5. **Password reset / daily digest email** — requires email on the backend.

> **Important:** Render **free** web services [block outbound SMTP](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports) (`25` / `465` / `587`). Plain Gmail SMTP will **not** work. Use **Brevo HTTPS API** instead (free ≈ 300/day; verify one sender email, then send to **any** registered user address).

### Brevo setup (Render — required for production recovery)

1. Sign up at [brevo.com](https://www.brevo.com) → **SMTP & API** → create an **API key**.
2. **Senders** → add & verify your email (e.g. Gmail) as a single sender.
3. Render → Environment → set:

| Variable | Example |
|----------|---------|
| `Brevo__ApiKey` | `xkeysib-...` |
| `Brevo__FromEmail` | your **verified** sender email |
| `Brevo__FromName` | `LearnChain` |
| `Digest__HourUtc` | `8` (optional) |

4. Save (service restarts) → **Forgot password** with any existing account email → that inbox gets username + 6-digit code.

### SMTP (local / paid Render only)

| Variable | Example |
|----------|---------|
| `Smtp__Host` | `smtp.gmail.com` |
| `Smtp__Port` | `587` |
| `Smtp__User` | your Gmail |
| `Smtp__Password` | [App Password](https://myaccount.google.com/apppasswords) |
| `Smtp__From` | `LearnChain <your@gmail.com>` |

> **Local Development:** if neither Brevo nor SMTP is set and `ASPNETCORE_ENVIRONMENT=Development`, forgot-password shows the code in the UI (no email).

Chat / memory / mail endpoints: `POST /api/chat`, `GET /api/chat/history`, `DELETE /api/chat/session`, `GET|DELETE /api/chat/memories`, `POST /api/chat/reminder`, `GET|PUT /api/chat/preferences`, `POST /api/user/forgot-password`.

---

## Focus Mode & Music

- **Focus Mode** — From Habits, start Focus on a due habit: estimate duration → fullscreen lock + timer → check-in with optional focus-bonus XP (requires staying long enough). Soft abandon is allowed. Companion may peek with dialogue during a long session.
- **Idle rest** — After inactivity, Canal may lazily peek and drop an aside line into chat history (local only).
- **Music page** (`/music`) — Play unlocked built-in AAC tracks (served from backend `/music/*`, proxied on Vercel). Upload personal audio (IndexedDB, device-local only). Collecting **all badges** unlocks hidden tracks.
- **Sidebar** — Now-playing + links to Music and About (`/about`).

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
- **Canal companion + Galgame stage.** Layered PSD-style PNGs (`frontend/Canal/`) compose a live face; emotions switch during typewriter dialogue via a clause-level timeline (`emotionTimeline.ts`). Assets and naming are author-provided.
- **Server-authoritative achievements.** Badge unlocks are evaluated on the backend (`AchievementService`) on login and via an explicit sync endpoint, so they can't be spoofed from the client.
- **Focus Mode + BGM.** Habit check-in can be gated behind a timed focus session with soundtrack unlocks tied to badge completion.
- **Docker-first, resilient deploy.** Connection-string parsing tolerates dashboard-mangled env vars; Dockerfile disables inotify file-watching for Render’s shared-host limits. Production prefers **PostgreSQL**; local/dev still uses SQLite.
- **Session hygiene.** JWT lifetime is 7 days; the frontend central `apiFetch` clears sticky `localStorage` sessions on expiry / 401 so the UI does not look “logged in” while every API fails.

---

## Advanced Features (Phase 2)

Per the MSA 2026 Phase 2 brief, the **three** advanced features chosen for marking are:

| # | Advanced Feature (from official list) | Status | Where to verify |
|---|---------------------------------------|--------|-----------------|
| 1 | **State management library (Zustand)** | ✅ Done | `frontend/src/stores/` — `habitStore`, `settingsStore`, `achievementStore`, `chatStore`, `companionStore`, `bgmStore`, `focusModeStore`, … |
| 2 | **Theme switching (light/dark mode)** | ✅ Done | `frontend/src/stores/settingsStore.ts`, `frontend/src/components/ThemeLocaleToggle.tsx` — day/night + EN/中文 |
| 3 | **Dockerize the project using Docker** | ✅ Done | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`, `render.yaml` |

> A fourth advanced feature — **Security Measures** — is also implemented (BCrypt password hashing, input validation/sanitisation, JWT + `[Authorize]`). It is documented below as a bonus but the three above are the ones nominated for marking.

### 1. State Management (Zustand)

**Why it matters:** Auth state, habits, settings, and achievements are needed across many unrelated screens. Prop-drilling or duplicating `useState` would cause stale data and re-render bugs. A central store keeps a single source of truth and lets any component subscribe to just the slice it needs.

**How it's implemented:**

- Multiple focused stores under `frontend/src/stores/`:
  - `habitStore.ts` — habits, auth session, check-in state
  - `settingsStore.ts` — theme + language + corner toggle
  - `achievementStore.ts` — unlocked badges and unlock popups
  - `chatStore.ts` / `companionStore.ts` — AI chat UI + Canal emotion / Gal mode flags
  - `bgmStore.ts` / `focusModeStore.ts` — music + focus session
  - `languageStore.ts` — kept as a backward-compatible alias of the settings store
- Stores are created with `create<State>()` and selected with fine-grained selectors (e.g. `useSettingsStore(s => s.language)`) to minimise re-renders.
- State that must survive reloads (theme/language corner, BGM prefs, Gal first-hover flags) is persisted to `localStorage` inside the store actions.

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
- **RBAC (Admin / SuperAdmin).** JWT includes a role claim; `/api/admin/*` requires Admin or SuperAdmin. Env bootstrap creates the sole **SuperAdmin** (`AdminBootstrap`). SuperAdmin can grant regular Admin and view the password vault; regular Admins keep the original management powers without touching staff or secrets. Banned users are rejected at login and by `BanCheckMiddleware`.

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
├── backend/              # .NET 10 Web API (SQLite local / Postgres prod, JWT)
├── backend.Tests/        # xUnit tests
├── frontend/             # React + Vite + Zustand + Tailwind
│   ├── Canal/            # Layered Canal companion PNGs (emotions)
│   └── src/
│       ├── components/ai/        # Chat panel, Galgame stage, speech
│       ├── components/character/ # Character / avatar / peek
│       ├── companions/           # Lines + emotion timeline
│       └── stores/               # Zustand stores
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
| Frontend | React 19, Vite, Zustand, React Router, Tailwind CSS 4, Framer Motion |
| Backend | ASP.NET Core 10, EF Core, SQLite / PostgreSQL, JWT Bearer |
| Deploy | Vercel (frontend + `/api` & `/music` rewrites), Render (backend Docker + **PostgreSQL**) |
| Database | PostgreSQL on Render (prod); SQLite locally |

---

## Self-Reflection

*If I were to do this project again, what would I do differently?*

- **Persist data in a real database.** Early versions used SQLite on Render’s ephemeral disk. Production now uses Postgres; I’d still design for durable storage from day one on any habit app.
- **Design the API contract first.** Some DTOs and endpoints evolved reactively as the frontend needed them, which caused a few mismatches. Writing an OpenAPI-first contract before coding would have reduced rework and kept naming consistent between client and server.
- **Add end-to-end tests earlier.** Backend xUnit + some frontend store tests exist, but companion/Galgame/focus flows are still mostly manual.
- **Move theme/language state into a persisted store middleware.** The current stores manually read/write `localStorage`. Using Zustand's `persist` middleware would remove that boilerplate and centralise hydration logic.
- **Harden production config sooner.** Issues like the Render inotify limit, CORS, JWT sticky sessions, and Vercel→Render `/music` cold starts were fixed reactively.
- **Improve accessibility.** The 4-corner toggle and Galgame stage are fun but need clearer keyboard/ARIA affordances for first-time users.
- **Companion expressions.** Emotion inference is still keyword/heuristic-based; a model-tagged emotion channel would be more reliable than client-side text sniffing alone.

---

## License

MSA 2026 coursework project.
