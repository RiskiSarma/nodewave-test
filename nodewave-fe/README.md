# NodeWave Frontend

Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4 + Radix UI, TanStack Query 5 + Axios, Zustand 5, React Hook Form + Zod. Biome + Husky + Commitlint.

## Run

```bash
cp .env.example .env.local     # NEXT_PUBLIC_BE_URL=<backend url>
npm install
npm run dev                    # http://localhost:3000
```

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## How it maps to the brief

- **Auth** – login / register, JWT in Zustand (persisted), Axios interceptor adds `Authorization`, 401 clears session, `(app)` layout is the route guard, logout calls the API (server-side revocation).
- **Board** – columns Blocked / To do / In progress / Done. "Blocked" comes from the API (`isBlocked`, `blockedBy`).
- **State-based buttons** – status buttons read `task.permissions.status[to]` from the API; disabled + tooltip with the reason. The API re-validates (422 / 403), so the lock is not UI-only.
- **Concurrency** – every write sends the `version` the form was loaded from. On 409 a conflict banner appears and the latest data is reloaded; the user's edit is never silently applied.
- **Client Guest** – separate view: aggregate progress + shared tasks. Payload is already masked by the API, so there is nothing to hide in CSS.
- **Extras** – daily standup panel, project activity (audit) table with pagination, team management (PM), file upload, internal comments.
- **States** – skeleton loading, empty, and error-with-retry on every list; responsive layout.

Brand colors live as tokens in `src/app/globals.css` (`--color-wave-*`); replace with the official NodeWave palette if needed.

## Deploy (Vercel)

Import the repo, set `NEXT_PUBLIC_BE_URL` to the live backend URL, deploy. Add the Vercel URL to the backend `FRONTEND_URL` (CORS).
