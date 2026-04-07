# Carton Cache

Track shipping carton inventory — new stock and collected reuse cartons — across one or more warehouse locations.

See [SPEC.md](./SPEC.md) for full application specification.

## Stack

- **Server**: Node.js + TypeScript + Express 5
- **Templates**: Eta
- **Reactivity**: Datastar (signals + SSE)
- **UI**: Semantic HTML, Modern CSS, HTML Web Components
- **Database**: Turso (libSQL / SQLite-compatible)
- **Auth**: Session-based (argon2id)
