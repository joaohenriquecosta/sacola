# Sacola

Gestão operacional para hortifruti — pedidos, separação e entrega.

Open source, MIT. MVP em construção para um cliente real (3 vendedores, 3 separadores, 3 entregadores, ~50 pedidos/dia).

## Documentação

- [SETUP.md](./SETUP.md) — especificação completa do produto e do modelo de dados
- [panorama.html](./panorama.html) — apanhado visual: decisões, cronograma e rascunho das telas (abre no navegador)

## Stack

- Next.js 16 (App Router) + React 19.2 + TypeScript
- Tailwind CSS 4
- Node 24 LTS

Mais peças (Postgres, sessão, etc) entram nos próximos commits, um por vez, no padrão do [automanews](https://github.com/joaohenriquecosta/automanews.com.br).

## Setup

```bash
nvm use
npm install
npm run dev
```

Em construção — abra http://localhost:3000.
