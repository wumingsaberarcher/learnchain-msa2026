# AI Usage Notes

## Summary

AI assistance (primarily Cursor / Claude) was used as a **development aid**, not as a substitute for understanding the project. The author implemented core ideas and requirements; AI helped with code generation, debugging, and learning from existing patterns in the codebase.

## Where AI Was Used

1. **Code implementation** — Scaffolding API endpoints, React components, Zustand stores, and CSS when the author had a clear feature spec but needed help with syntax or structure (e.g. achievement system, calendar component, Render/Vercel deployment fixes).

2. **Debugging** — Diagnosing build failures (TypeScript errors, Docker path issues, SQLite connection strings on Render) by reading logs and suggesting targeted fixes.

3. **Code reading** — Explaining how existing modules work (habit due-date logic, JWT flow, theme CSS) so the author could extend them confidently.

## Where AI Was Not Relied On

- Product concept and UX goals (habit types, gamification, calendar layout, achievement badges)
- Badge artwork and naming (author-provided assets in `frontend/src/assets/badges/`)
- Final review and acceptance of all merged changes

## Tooling

| Tool | Purpose |
|------|---------|
| Cursor IDE | Primary editor with inline AI assistance |
| GitHub | Source control and CI deploy hooks |

## Academic Integrity Note

This document is provided for course transparency. AI helped accelerate implementation and troubleshooting; design choices and project ownership remain with the author.
