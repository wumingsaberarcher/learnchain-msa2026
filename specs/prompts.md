# Prompt Archive

Representative prompts used during development. Paraphrased for clarity; not a full chat log.

---

## Deployment

> Help check if my files meet Render.com and Vercel.com deployment requirements. Dockerfile and Program.cs had errors.

**Outcome:** Fixed Dockerfile paths for repo-root build context, PORT binding, SQLite/Postgres connection handling, CORS env var, and added `vercel.json` (later also `/music` rewrite).

---

## Achievements & profile

> Add a profile dropdown on username click with bio, join date, email, password change, achievement gallery with 26 badges, unlock popups, and motivational quotes on the dashboard.

**Outcome:** `UserProfileMenu`, `Profile` / `Achievements` pages, `AchievementService`, badge definitions wired to PNG assets.

---

## Dashboard calendar

> Replace dashboard "My Habits" cards with a large calendar showing daily check-in items on each date, list detail per day, strikethrough animation when done, auto-update when new habits are added.

**Outcome:** `HabitCalendar` component + `habitCalendarHelpers.ts` with due-date projection aligned to backend rules.

---

## AI assistant (v1)

> Floating chat bot: text + voice, tools to read habits / create-rename-delete, email today’s reminder; API key stays in the browser.

**Outcome:** `ChatController`, `AiAssistantService` tool loop, `AiAssistant` UI, Profile AI settings, Brevo/SMTP email path.

---

## Admin RBAC

> Sole SuperAdmin from env; grantable Admin; ban / XP / badges / password vault for Cipher only.

**Outcome:** `AdminController`, role claims, `AdminBootstrap`, `/admin` UI.

---

## Companion, Focus, Music (v2)

> Add Canal layered character emotions; idle/focus peeks; Focus Mode with timer and bonus XP; BGM page with unlockable tracks and local uploads; About page.

**Outcome:** `frontend/Canal/` + `Character` / `CanalAvatar` / `CompanionPeek`, `FocusModeOverlay`, `bgmStore` + `Music` page, `/about`.

---

## Galgame dialogue & speech

> First hover surprise once; click avatar → smoke bomb → fullscreen Galgame with typewriter emotions mid-sentence; continuous mic with volume bars; red exit button that farewell-speaks on hover.

**Outcome:** `GalgameStage`, `SmokeBurst`, `emotionTimeline`, continuous `useSpeechInput`, exit farewell lines.

---

## Fear emotion pack

> I added a new fear expression set under Canal — wire it into the character and emotion inference.

**Outcome:** `Emotion` union includes `fear`; assets mapped in `emotionAssets.ts`; keyword/timeline detection updated.

---

## Auth / music reliability

> Sudden mass 401 on `/api/*`; music sometimes cannot play.

**Outcome:** Central `apiFetch` + JWT expiry logout; longer token lifetime; BGM hydrate single-flight + gesture/retry hardening.

---

## Bug fixes (selected)

> Vercel build error: `Namespace translations has no exported member zh` in BadgeCard.tsx.

**Outcome:** Removed unused helper with invalid type reference.

> Render deploy: SQLite connection string format error at startup.

**Outcome:** Switched to `DataSource=` without spaces; added connection string normalization; later Postgres on Render.

> `The node already has a parent` after AI creates a habit (habit saved but chat 400 / no reply).

**Outcome:** DeepClone `messages` when building each LLM request body; fallback reply if tools already succeeded.

> `GalgameStage.tsx`: `Type 'Number' has no call signatures` (shadowed `t`).

**Outcome:** Renamed `setTimeout` handle to `timer`.

---

## Documentation

> Write README with deployment links and a `/specs` folder for AI usage, design decisions, and prompts.

**Outcome:** This folder and root README (later refreshed for companion / Focus / music / auth).
