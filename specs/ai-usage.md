# AI Usage Notes

## Summary

AI assistance (primarily Cursor) was used as a **development aid**, not as a substitute for product ownership. The author defined features, supplied Canal art / badge assets, and accepted or revised all merged changes. AI accelerated scaffolding, debugging, and documentation updates against an existing codebase.

## Where AI Was Used

1. **Code implementation** — API endpoints, React components, Zustand stores, and CSS when the author had a clear feature spec (e.g. achievements, calendar, AI chat tools, companion Galgame stage, Focus Mode, BGM player, admin RBAC, auth session hygiene).

2. **Debugging** — Build failures (TypeScript, Docker paths, Vercel), JWT sticky 401s after token expiry, `JsonNode` “already has a parent” after tool calls, Web Speech quirks, and intermittent BGM autoplay / IndexedDB blob revoke races.

3. **Code reading** — Explaining habit due-date logic, JWT flow, theme CSS, and companion emotion pipelines so the author could extend them confidently.

4. **Documentation** — Keeping `README.md` and `specs/` aligned with newer companion / Focus / music / auth behaviour.

## Where AI Was Not Relied On

- Product concept and UX goals (habit types, gamification loop, Canal companion fantasy, Focus Mode framing)
- Canal layered artwork and emotion sets (author assets under `frontend/Canal/`, including `fear`)
- Badge artwork and naming (`frontend/src/assets/badges/`)
- Final review and acceptance of all merged changes
- Production secrets (API keys, Brevo, JWT, Admin bootstrap credentials)

## Tooling

| Tool | Purpose |
|------|---------|
| Cursor IDE | Primary editor with agent assistance |
| GitHub | Source control and deploy hooks (Vercel / Render) |

## Academic Integrity Note

This document is provided for course transparency. AI helped accelerate implementation and troubleshooting; design choices, assets, and project ownership remain with the author.
