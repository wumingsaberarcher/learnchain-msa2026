# LearnChain

Gamified personal learning habit tracker — React + .NET 10 (MSA 2026 Phase 2).

## Quick Start with Docker

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

```bash
docker compose up --build
```

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost:8080  |
| Backend  | http://localhost:5000  |
| Health   | http://localhost:5000/health |

The frontend proxies `/api` requests to the backend via nginx. SQLite data is persisted in the `learnchain-db` Docker volume.

Stop:

```bash
docker compose down
```

## Local Development (without Docker)

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

For local dev, the API defaults to `/api` — use Vite proxy or set `VITE_API_BASE=http://localhost:5000/api`.

## Running Tests

**Backend** (HabitController, CheckInController, services):

```bash
cd backend.Tests
dotnet test
```

**Frontend** (Zustand stores, helpers, components):

```bash
cd frontend
npm install
npm test
```

## Project Structure

```
learnchain-msa2026/
├── backend/           # .NET 10 Web API
├── backend.Tests/     # xUnit tests
├── frontend/          # React + Vite + Zustand
├── docker-compose.yml
└── README.md
```
