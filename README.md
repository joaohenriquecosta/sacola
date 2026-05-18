# Sacola

[![Linting](https://github.com/joaohenriquecosta/sacola/actions/workflows/linting.yaml/badge.svg)](https://github.com/joaohenriquecosta/sacola/actions/workflows/linting.yaml)
[![Tests](https://github.com/joaohenriquecosta/sacola/actions/workflows/tests.yaml/badge.svg)](https://github.com/joaohenriquecosta/sacola/actions/workflows/tests.yaml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-24-339933?logo=node.js&logoColor=white)](./.nvmrc)

Operational management for greengrocers — orders, picking, and delivery.

Open source MIT. MVP under construction for a real client in Brazil (3 sellers, 3 pickers, 3 carriers, ~50 orders/day).

## Documentation

- [SETUP.md](./SETUP.md) — full product specification and data model (in Portuguese — the project's domain language)
- [panorama.html](./panorama.html) — visual overview: decisions, roadmap and screen wireframes (open in browser)

## Stack

- Next.js 16 (App Router) + React 19.2 + TypeScript
- Tailwind CSS 4 + shadcn/ui (Vega style, Taupe base color)
- PostgreSQL 16 via Docker locally, [Neon](https://neon.com) in production
- `pg` directly, no ORM
- Jest for unit and integration tests
- Node 24 LTS

More pieces (auth, orders, stock) land one at a time, following the [automanews](https://github.com/joaohenriquecosta/automanews.com.br) convention.

## Setup

Prerequisites: Node 24 (`nvm use`), Docker.

```bash
nvm use
npm install
npm run dev
```

`npm run dev` starts Postgres via Docker, waits for it, runs pending migrations, and launches Next dev at http://localhost:3000.

## Language convention

This project targets an international developer audience while serving a Brazilian end user. **Code, comments, tests, docs and commit messages are in English.** Anything visible to the human end user — UI strings, HTTP error messages aimed at the client, OG metadata — is in **Brazilian Portuguese (pt-BR)**.

`SETUP.md` is the one exception: it's a design doc carrying the client's domain vocabulary (separador, fiado, tag de entrega, etc), and translating it would lose nuance.

## License

[MIT](./LICENSE) © João Henrique Costa
