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

## License

MSA 2026 coursework project.
