# Design Decisions

## Architecture

### Monorepo with split deployment

- **Frontend** on Vercel, **backend** on Render — free-tier hosting and simple CI from GitHub.
- Production frontend prefers **same-origin** `VITE_API_BASE=/api` with `vercel.json` rewrites to Render (avoids browser CORS). `/music/*` is rewritten the same way for BGM files.
- CORS still allows the Vercel origin (and permissive fallbacks) when calling the API host directly.

### Database: SQLite local, PostgreSQL production

- Local / Docker Compose defaults to **SQLite** for coursework simplicity.
- Render production uses **PostgreSQL** (`ConnectionStrings__DefaultConnection`) so habits/XP survive redeploys.
- `DatabaseMigrator` / EnsureCreated-style bootstrap plus additive schema patches keep coursework deploys moving without a heavy migration ceremony.

### JWT authentication

- Stateless Bearer tokens; frontend stores token + user snapshot in `localStorage`.
- Passwords hashed with BCrypt on the server.
- Token lifetime is **7 days** (`Jwt:DurationInMinutes`); validation uses a small **clock skew** (~2 minutes).
- Frontend `apiFetch` (`frontend/src/api/http.ts`) attaches the Bearer token, detects JWT `exp`, and **logs out on 401** so a sticky expired session does not spam failing API calls while the UI still looks logged in.
- Signing key resolution is aligned between `Program.cs` and token issuance (`Jwt:Key` / `JWT_KEY`).

### RBAC

- Roles: `User` | `Admin` | `SuperAdmin`.
- Env bootstrap creates the sole SuperAdmin; registration always yields `User`.
- `/api/admin/*` is role-gated; `BanCheckMiddleware` rejects banned accounts after JWT auth.

---

## Frontend

### State management (Zustand)

| Store | Responsibility |
|-------|----------------|
| `habitStore` | Habits, login session, today check-ins |
| `settingsStore` | Theme (day/night) + language via 4-corner toggle |
| `achievementStore` | Profile, badges, unlock queue |
| `chatStore` | AI chat messages, send/hydrate/clear |
| `companionStore` | Canal emotion, Gal mode open flags, first-hover persistence, user avatar |
| `bgmStore` | Track selection, unlocks, volume, user uploads |
| `focusModeStore` | Focus session estimate / running / abandon |

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
- Unlocking **all** badges unlocks hidden BGM tracks.

---

## AI companion (Canal)

### Layered character

- Source art lives under `frontend/Canal/` (author assets): body layers + per-emotion face parts (eyebrow / eyelash / eyewhite / irides / mouth).
- Emotions: `normal` | `smile` | `angry` | `sorrow` | `surprise` | `fear`.
- `Character.tsx` stacks layers; `CanalAvatar` crops for chat/FAB; `CompanionPeek` for idle/focus overlays.

### Chat tools (backend)

`AiAssistantService` exposes tools only:

| Tool | Capability |
|------|------------|
| `get_account_overview` / `get_today_status` / `list_habits` | Read |
| `create_habit` / `rename_habit` / `delete_habit` | Write (soft-delete) |
| `send_today_reminder` | Email digest |

Explicitly **not** allowed: marking check-ins, changing difficulty after create, free-form XP (maps to difficulty 1–3 → 10/20/30 XP).

Request bodies **DeepClone** the `messages` JsonArray each LLM round — `System.Text.Json.Nodes` forbids re-parenting the same node (caused “The node already has a parent” after successful tool runs).

### Companion memory

- **L1** short-term messages in DB (`ChatSession` / `ChatMessage`)
- **L2** rolling summary when history grows
- **L3** `UserMemory` facts (preference / fact / event / relationship)
- Injected into the system prompt; Profile can list/delete/reset conversation vs all memories.

### Galgame stage

- First avatar hover (persisted once) → `surprise`.
- Click → smoke burst → fullscreen left portrait + bottom typewriter dialogue + input.
- Clause-level `emotionTimeline` drives face changes while text types.
- Red **Exit** control: hover plays angry/sorrow farewell; click exits after farewell.

### Speech input

- Web Speech API forced to `zh-CN` for character output (not pinyin).
- Continuous listening until the user toggles off; mic UI shows a live volume waveform.

---

## Focus Mode & Music

### Focus Mode

- Started from Habits on a due habit: estimate → fullscreen timer → check-in with optional **focus bonus XP** when duration thresholds are met.
- Soft abandon returns without check-in.
- Long sessions may trigger Canal peeks (aside lines logged locally into chat).

### BGM

- Built-in AAC files served from backend `Music/` at `/music/*`.
- `BgmPlayer` respects autoplay policy (gesture unlock), retries load failures once, and avoids IndexedDB hydrate races that revoked live blob URLs.
- User uploads stay in **IndexedDB** (device-local; not uploaded to the server).

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

### Email

- Production: **Brevo HTTPS** (Render free blocks SMTP).
- Optional SMTP for local / paid hosts.
- Daily digest hosted service + chat reminder tool.

---

## Deployment

### Docker build context

- Render clones the **repo root**; `backend/Dockerfile` copies `backend/backend.csproj` accordingly.

### Vercel rewrites

- `/api/:path*` → Render API
- `/music/:path*` → Render static music

### Connection string

- Prefer Render **Internal Database URL** for Postgres.
- Local SQLite: use `DataSource=/path` (no space) when containerised.

---

## Internationalization

- Single `translations.ts` file with `zh` / `en` keys (incl. `chat.gal*` Galgame copy).
- `useTranslation()` hook reads active language from settings store.
