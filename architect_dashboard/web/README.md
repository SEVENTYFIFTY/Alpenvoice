# Atelier Spotlight (React)

A second view of the studio for the principal's screen: every project as a fanned, auto-advancing
**card stack**. The card in front shows its overall %, today's and this week's movement, the plan
marker, a phase strip, blockers and the deadline. Below the stack, the front project's phases are listed
with dates, owners and % complete. It updates live, like the main dashboard.

It's a Next.js app built to static files. Atelier's Python server serves them at **`/spotlight/`**
and provides the data (`/api/dashboard`, live `/api/events`). Sign-in is shared with the main app.

## Stack

| | |
|---|---|
| TypeScript | `tsconfig.json`, strict mode, `@/*` import alias |
| Tailwind CSS v4 | `postcss.config.mjs` + `@import "tailwindcss"` in `app/globals.css` |
| shadcn/ui structure | `components.json`, `lib/utils.ts` (`cn`), theme tokens in `app/globals.css` |
| Components | `components/ui/card-stack.tsx` (vendored), `components/spotlight/*` (Atelier's own) |
| Packages | `next`, `react`, `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`, `tw-animate-css` |

### Why `components/ui`

`components.json` points shadcn's `ui` alias at `@/components/ui`. The shadcn CLI, and snippets from
shadcn-style sources such as 21st.dev, expect it there: they import each other as
`@/components/ui/<name>` (the card-stack demo, for example, imports `@/components/ui/card-stack`).
Keeping copied-in components in that one folder means:
- `npx shadcn add …` installs next to them without breaking imports;
- vendored files stay separate from Atelier's own code in `components/spotlight/`, so they can be
  updated by copying the new version over them;
- `eslint.config.mjs` can relax a few rules for that folder only, so vendored code stays exactly as
  published while Atelier's code is linted strictly.

## Setting it up from scratch

This is how the project was created, for reference or to reproduce it:

```bash
npx create-next-app@latest web --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*"
cd web
npx shadcn@latest init            # writes components.json, lib/utils.ts and the theme tokens
npm install framer-motion lucide-react
# then copy card-stack.tsx into components/ui/
```

`shadcn init` needs to reach `ui.shadcn.com`. Where that host is blocked, create the same files by
hand, as was done here: `components.json`, `lib/utils.ts`, and the token block in `app/globals.css`.
Install `clsx tailwind-merge class-variance-authority tw-animate-css` from npm. Adding more
shadcn components later (`npx shadcn add button`) also needs that host.

## Develop

```bash
npm install
# in another terminal, run Atelier's Python server on :8000
npm run dev          # http://localhost:3000/spotlight/ ; /api is proxied to ATELIER_API (default http://localhost:8000)
```

Sign in to the main app at http://localhost:8000/ first, in the same browser. Browsers share cookies
between ports on `localhost`, so the dev server on :3000 is then signed in too.

## Build (what the server uses)

```bash
npm install && npm run build   # -> out/, served by Atelier at /spotlight/
```

Restart Atelier after the first build so it picks up `out/`. Until it is built, `/spotlight/` shows
these instructions.

Checks: `npm run lint`, `npx tsc --noEmit`.
