# frontend

A [swift-rust](https://github.com/colesites/swift-rust) app — the full demo
starter: blog, dashboard, API routes, and the Image / PDF / Video / Font
components wired up.

## Develop

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
bun run build   # → .vercel/output (Build Output API v3)
```

## Structure

```
src/
  app/         file-based routes (pages, layouts, API routes)
  components/  shared UI
  lib/         data + helpers
public/        static assets and samples
```
