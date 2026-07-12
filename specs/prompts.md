# Prompt Archive

Representative prompts used during development. Paraphrased for clarity; not a full chat log.

---

## Deployment

> Help check if my files meet Render.com and Vercel.com deployment requirements. Dockerfile and Program.cs had errors.

**Outcome:** Fixed Dockerfile paths for repo-root build context, PORT binding, SQLite connection string format, CORS env var, and added `vercel.json`.

---

## Achievements & profile

> Add a profile dropdown on username click with bio, join date, email, password change, achievement gallery with 26 badges, unlock popups, and motivational quotes on the dashboard.

**Outcome:** `UserProfileMenu`, `Profile` / `Achievements` pages, `AchievementService`, badge definitions wired to PNG assets.

---

## Dashboard calendar

> Replace dashboard "My Habits" cards with a large calendar showing daily check-in items on each date, list detail per day, strikethrough animation when done, auto-update when new habits are added.

**Outcome:** `HabitCalendar` component + `habitCalendarHelpers.ts` with due-date projection aligned to backend rules.

---

## Bug fixes

> Vercel build error: `Namespace translations has no exported member zh` in BadgeCard.tsx.

**Outcome:** Removed unused helper with invalid type reference.

> Render deploy: SQLite connection string format error at startup.

**Outcome:** Switched to `DataSource=` without spaces; added connection string normalization in `Program.cs`.

---

## Documentation

> Write README with deployment links and a `/specs` folder for AI usage, design decisions, and prompts.

**Outcome:** This folder and updated root README.
