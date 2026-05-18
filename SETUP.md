# Sacola — Especificação do MVP

Sistema de gestão operacional para hortifruti com vendas via WhatsApp, separação distribuída e entrega por motoboys.

Projeto open source com cliente real (hortifruti com 3 vendedores, 3 separadores, 3 entregadores, ~50 pedidos/dia).

---

## 1. Contexto do negócio

### O cliente

Hortifruti que opera assim:

- **Vendedores (3):** remotos, recebem pedidos exclusivamente pelo WhatsApp.
- **Separadores (3):** cada um tem seu próprio mini-estoque ("mini-varejão"). São abastecidos periodicamente. Cada separador atende um conjunto próprio de produtos.
- **Entregadores (3):** informais, controlados pelo gerente. Pegam pedidos de qualquer separador. Fazem 2 ou 3 saídas por dia, em "ondas", até a hora de corte.
- **Gerente:** controla limite de fiado, cadastros, aprovações de margem, conciliação.

### A dor principal

Hoje tudo passa pelo WhatsApp e alguém precisa redigitar tudo numa planilha. **Tudo dá muito trabalho de conferir**: pedido, separação, entrega, recebimento. O sistema existe pra matar essa redigitação e fazer tudo "bater" — daí o nome **Sacola**.

### Fluxo operacional

1. Vendedor recebe pedido pelo WhatsApp e lança no Sacola, escolhendo cliente, separador e itens.
2. Separador vê fila de pedidos, separa, pesa cada item (registra peso real), fecha o pedido. Cola etiqueta no saquinho com a tag de identificação.
3. Entregador vê fila de pedidos prontos com tag de identificação, endereço e valor. Sai em ondas. Não precisa saber o conteúdo do pedido.
4. Vendedor alinha entrega no WhatsApp simultaneamente com cliente e entregador ("já saiu, pode descer").
5. Vendedor marca pagamento (Pix ou dinheiro), ou marca como fiado.
6. Gerente confere extrato bancário e marca pagamentos confirmados.

---

## 2. Decisões de produto (escopo do MVP)

### Entra no MVP

- Cadastro de usuários (login simples cadastrado pelo gerente, sem magic link, sem signup).
- Cadastro de clientes com limite de fiado em centavos.
- Cadastro de produtos (catálogo global) e relação produto-separador (cada separador tem seu mix).
- Lançamento de pedido pelo vendedor.
- Tela do separador com fila e pesagem item a item.
- Tela do entregador com fila de pedidos prontos por tag.
- Registro de pagamento pelo vendedor (Pix/dinheiro/fiado).
- Estoque com ledger de movimentações desde o dia 1 (auditoria total).
- Estorno automático de estoque ao cancelar pedido separado.
- Snapshot de preço no item do pedido (preço histórico preservado).
- Dashboard simples do gerente (pedidos do dia, status, valores).

### Fica fora do MVP (fase 2)

- Conciliação automática de extrato bancário (MVP: gerente marca manual).
- Fluxo de aprovação de desconto pelo gerente (MVP: vendedor lança preço tabela).
- Cadastro e contas a pagar de fornecedores.
- Relatório de perdas detalhado.
- Otimização de rota de entrega.
- Notificação automática via WhatsApp (MVP: vendedor manda zap manual).
- App mobile nativo (MVP: web responsivo).

### Decisões de modelagem importantes

- **Estoque como ledger:** saldo = SUM de tabela de movimentações. Toda entrada, saída, ajuste e estorno é uma linha. Sem coluna `saldo_kg` atualizada. Performance suficiente pra 50 pedidos/dia; otimização vira fase 2 se necessário.
- **Dinheiro em centavos inteiros.** Nunca float.
- **Peso em gramas inteiros.** Nunca float.
- **Pedido tem item com dois pesos:** `quoted_grams` (o que vendedor lançou) e `picked_grams` (o que separador pesou). Sistema cobra o separado.
- **Item não separado:** `picked_grams = 0` significa falta de estoque, item vai como não entregue, pedido segue.
- **Tag de entrega:** decidir depois. No MVP, gerar string única curta (formato exato a definir).
- **Vendedor escolhe o separador** ao lançar o pedido. Sistema bloqueia se separador não tem o produto no catálogo dele.
- **Cancelamento de pedido separado:** estoque retorna automaticamente via movimentação tipada `cancellation_reversal`.
- **Vendedor registra pagamento** (não entregador). Entregador só marca entregue.
- **Histórico de preço:** `order_items.quoted_price_cents` guarda snapshot do preço no momento da venda.
- **Saldo previsto do separador:** na tela do separador, mostrar em tempo real o saldo atual de cada produto, o quanto está reservado para pedidos da fila e a sobra prevista após cumprir tudo. Permite ao separador antecipar ruptura sem precisar conferir manualmente.
- **Primeiro usuário** (gerente) criado via CLI local (`npm run usuario:criar`). Sem bootstrap automático, sem senha em env. Depois disso, gerente cria os outros via API.

---

## 3. Stack técnica

Padrões inspirados em `joaohenriquecosta/automanews` (mesma família de convenções: `infra/`, `models/`, sem ORM, migrations versionadas). Versões alvo:

- **Next.js 16** (App Router, sem pasta `src/`)
- **React 19.2**
- **TypeScript 5.7+**
- **Node.js 24 LTS**
- **Tailwind CSS 4**
- **node-postgres** (`pg`) — sem ORM
- **node-pg-migrate** — migrations forward-only (sem `.down`)
- **Neon** (Postgres serverless) — banco em produção; **Docker Postgres 16** local
- **Vercel** — deploy
- **Jest** — testes em modo TDD (vermelho → verde → refactor)
- **shadcn/ui** — componentes copiados em `components/ui/`, sob Radix + Tailwind
- **next-themes** — tema claro/escuro alternável no app inteiro, padrão segue `prefers-color-scheme` e persiste em `localStorage`

### Sem ORM, por quê

O dono do projeto já trabalha com SQL escrito à mão em outros repositórios. Manter o padrão. Tipagem do retorno fica explícita por função em `models/`. Migrations versionadas em `infra/migrations/`.

### Auth

Login simples (login + senha) cadastrado pelo gerente. Sem registro público. Sem reset automático no MVP (gerente reseta — gera senha temporária aleatória, força troca no próximo login).

- **Senha**: bcrypt (rounds 14 prod, 1 dev). Mínimo **12 chars com pelo menos 1 caractere especial**.
- **Sessão**: DB-backed (tabela `sessions`), token opaco de 96 chars hex em cookie httpOnly + sameSite=lax + secure em prod. **Lifetime 6 horas** com refresh em uso (cobre um expediente de hortifruti). Revogação imediata por DELETE da linha.
- **Cookie**: `sacola_session_id`.
- **Autorização** feature-based no estilo automanews (`PERMISSIONS`, `isAuthorized`, `filterOutput`), com features **derivadas do `papel`** — sem coluna `features` na tabela.
- **Anti-timing**: dummy bcrypt hash quando login não existe (mesma latência do caminho válido).
- **Anti-enumeração**: erros de login não distinguem "login não existe" de "senha errada".
- **Rate limit**: fase 2 (não MVP).

---

## 4. Papéis e permissões

Os papéis no banco (`users.role`) ficam em inglês — `manager`, `seller`, `picker`, `courier` — pra alinhar com o resto do schema. Na UI o usuário humano vê em português ("gerente", "vendedor", "separador", "entregador").

| Papel     | Pode fazer                                                                                  |
| --------- | ------------------------------------------------------------------------------------------- |
| `manager` | Tudo. Cadastra usuários, clientes, produtos, abastece estoque, ajustes.                     |
| `seller`  | Cria pedido, registra pagamento, vê seus pedidos, vê catálogo de cada separador.            |
| `picker`  | Vê fila de pedidos para si, registra peso, finaliza separação, faz contagem do seu estoque. |
| `courier` | Vê fila de pedidos prontos, marca em rota, marca entregue.                                  |

---

## 5. Modelo de dados

Todas as tabelas em `snake_case` e nomes em **inglês** (regra de idioma do projeto). IDs como `uuid` (gerar com `gen_random_uuid()` — habilitar `pgcrypto`). Timestamps em `timestamptz`.

### `users`

```sql
id              uuid PK
name            text NOT NULL
username        text UNIQUE NOT NULL
password_hash   text NOT NULL
role            text NOT NULL CHECK (role IN ('manager','seller','picker','courier'))
active          boolean NOT NULL DEFAULT true
created_at      timestamptz NOT NULL DEFAULT now()
```

Coluna `temporary_password boolean` é adicionada quando a regra "gerente cria usuário com senha temporária" entrar.

### `clients`

```sql
id                  uuid PK
name                text NOT NULL
phone               text
address             text
initials            text  -- usado pra gerar tag de entrega futuramente
credit_limit_cents  integer NOT NULL DEFAULT 0  -- "fiado" / store tab
active              boolean NOT NULL DEFAULT true
created_at          timestamptz NOT NULL DEFAULT now()
```

### `products`

```sql
id              uuid PK
name            text NOT NULL
unit            text NOT NULL CHECK (unit IN ('kg','un'))
price_cents     integer NOT NULL  -- por kg se unit=kg; por unidade se unit=un
active          boolean NOT NULL DEFAULT true
created_at      timestamptz NOT NULL DEFAULT now()
```

### `picker_products`

Relação N:N: quais produtos cada separador atende.

```sql
picker_id   uuid REFERENCES users(id)
product_id  uuid REFERENCES products(id)
active      boolean NOT NULL DEFAULT true
PRIMARY KEY (picker_id, product_id)
```

### `stock_movements`

O ledger. Saldo de um par (picker, product) = `SUM(grams)` desta tabela.

```sql
id            uuid PK
picker_id     uuid REFERENCES users(id) NOT NULL
product_id    uuid REFERENCES products(id) NOT NULL
grams         integer NOT NULL  -- positivo = entrada, negativo = saída
type          text NOT NULL CHECK (type IN ('restock','order_pick','count_adjustment','loss','cancellation_reversal'))
reference_id  uuid  -- ex: order_id quando type=order_pick ou cancellation_reversal
notes         text
created_at    timestamptz NOT NULL DEFAULT now()
created_by    uuid REFERENCES users(id) NOT NULL
```

Índice em `(picker_id, product_id)` pra calcular saldo rapidamente.

### `orders`

```sql
id                    uuid PK
code                  text UNIQUE NOT NULL  -- código curto humano (ex: P-2026-0001)
client_id             uuid REFERENCES clients(id) NOT NULL
seller_id             uuid REFERENCES users(id) NOT NULL
picker_id             uuid REFERENCES users(id) NOT NULL
courier_id            uuid REFERENCES users(id)  -- nulo até atribuir
delivery_tag          text  -- identificação curta (ex: #bjg-1) — formato definido em fase 2
status                text NOT NULL CHECK (status IN ('new','picking','picked','delivering','delivered','canceled'))
notes                 text
created_at            timestamptz NOT NULL DEFAULT now()
updated_at            timestamptz NOT NULL DEFAULT now()  -- usado pelo stream realtime
picked_at             timestamptz
out_for_delivery_at   timestamptz
delivered_at          timestamptz
canceled_at           timestamptz
canceled_by           uuid REFERENCES users(id)
cancellation_reason   text
```

### `order_items`

```sql
id                  uuid PK
order_id            uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL
product_id          uuid REFERENCES products(id) NOT NULL
quoted_grams        integer NOT NULL  -- pra unit=un, multiplicar por 1000 ou usar coluna separada se for refactor
picked_grams        integer  -- NULL = ainda não separado; 0 = falta de estoque
quoted_price_cents  integer NOT NULL  -- snapshot do preço no momento da venda (por kg ou por un)
total_cents         integer  -- calculado quando separado: round(picked_grams * price / 1000) pra kg
```

Observação sobre `unit = 'un'`: tratar 1 unidade = 1000 gramas internamente, ou criar `quantity` + `unit` separados. **Decisão pro MVP:** manter `quoted_grams`/`picked_grams` mas para produtos `unit='un'` usar gramas como sinônimo de "milhares" (1 un = 1000) e ajustar formatação na UI. Refactor pra coluna dedicada vira fase 2 se ficar feio.

### `payments`

```sql
id              uuid PK
order_id        uuid REFERENCES orders(id) NOT NULL
amount_cents    integer NOT NULL
method          text NOT NULL CHECK (method IN ('pix','cash','tab'))  -- "tab" = fiado
paid_at         timestamptz NOT NULL DEFAULT now()
registered_by   uuid REFERENCES users(id) NOT NULL
confirmed       boolean NOT NULL DEFAULT false  -- gerente confirma após ver extrato (fase 2 vira automático)
notes           text
```

### `sessions`

```sql
id          uuid PK
user_id     uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL
token       text UNIQUE NOT NULL  -- 96 hex chars
expires_at  timestamptz NOT NULL
created_at  timestamptz NOT NULL DEFAULT now()
updated_at  timestamptz NOT NULL DEFAULT now()
```

### `action_logs`

Auditoria genérica. Opcional mas recomendado.

```sql
id           uuid PK
user_id      uuid REFERENCES users(id) NOT NULL
action       text NOT NULL  -- ex: 'order.created', 'order.picked'
entity       text NOT NULL  -- ex: 'order'
entity_id    uuid NOT NULL
details      jsonb
created_at   timestamptz NOT NULL DEFAULT now()
```

---

## 6. Telas (MVP)

Mobile-first. Tudo responsivo. Sem app nativo.

### Públicas

- `/login` — usuário e senha.

### Gerente (`manager`)

- `/admin/users` — lista, criar, ativar/desativar, resetar senha.
- `/admin/clients` — lista, criar, editar, ajustar limite de fiado.
- `/admin/products` — lista, criar, editar preço (atenção: pedidos existentes mantêm preço antigo via snapshot).
- `/admin/catalog` — matriz separador × produto, marcar quem atende o quê.
- `/admin/stock` — saldo por separador × produto, lançar abastecimento, lançar perda.
- `/admin/orders` — visão geral do dia, filtros por status/separador/vendedor.
- `/admin/payments` — lista, confirmar manualmente.

### Vendedor (`seller`)

- `/seller` — dashboard do dia (meus pedidos, pendentes de pagamento).
- `/seller/orders/new` — escolhe cliente → escolhe separador → adiciona itens (valida catálogo do separador, valida estoque, valida limite de fiado).
- `/seller/orders/[id]` — detalhe, registrar pagamento, cancelar.

### Separador (`picker`)

- `/picker` — fila dos meus pedidos (`new`, `picking`) **+ banner de saldo previsto por produto após cumprir a fila** (estoque atual − reservado pela fila). Botão "começar separação".
- `/picker/orders/[id]` — lista de itens. Em cada item, ao pesar, mostrar: estoque agora, após este item, reservado pro resto da fila, sobra prevista (com alerta visual se vai estourar). Botão "marcar item separado / faltou", botão "finalizar separação".
- `/picker/count` — minha contagem manual: para cada produto meu, ver saldo teórico, registrar saldo físico, sistema lança `count_adjustment`.

### Entregador (`courier`)

- `/courier` — fila de pedidos prontos, agrupada por onda do dia. Cada card mostra tag de entrega, endereço, valor a receber (informativo), forma de pagamento.
- `/courier/orders/[id]` — botão "saí com este", botão "entreguei", botão "voltou (não entregou)".

---

## 7. Regras de negócio críticas

### Criação de pedido

- Cliente precisa estar ativo (`active = true`).
- Separador escolhido precisa estar ativo e ter `role = 'picker'`.
- Cada item precisa estar no catálogo do separador escolhido (`picker_products` ativo).
- Se forma de pagamento prevista = `tab` (fiado), validar `credit_limit_cents` do cliente vs débito atual + valor estimado do pedido. Se exceder, bloquear ou pedir aprovação do gerente (MVP: bloquear).
- Sistema gera `code` sequencial humano e `delivery_tag` (formato a definir).

### Separação

- Separador só vê pedidos onde `picker_id = ele`.
- Ao marcar item separado com peso: validar que `picked_grams <= saldo atual`. Se exceder, separador pode marcar falta (`picked_grams = 0`) ou ajustar.
- Ao finalizar separação: para cada item com `picked_grams > 0`, lançar movimentação `order_pick` com `grams = -picked_grams`. Atualizar `orders.picked_at` e `status = 'picked'`. Calcular `total_cents` por item.
- **Saldo previsto** (informativo, não bloqueia): para cada produto do catálogo do separador, calcular em runtime:
  - `current_balance` = `SUM(grams)` em `stock_movements`
  - `reserved` = `SUM(quoted_grams)` de `order_items` cujos pedidos têm `picker_id = ele` e `status IN ('new','picking')` e o item ainda não foi separado (ou usa `picked_grams` se já foi)
  - `expected_balance` = `current_balance − reserved`
  - Alerta visual quando `expected_balance` < limite definido (sugestão MVP: alerta se ≤ 10% do `current_balance` ou ≤ 1 unidade pra produtos `unit='un'`).

### Entrega

- Entregador vê pedidos `status = 'picked'` sem `courier_id`, ou com `courier_id = ele`.
- Ao "sair com este": setar `courier_id` (se nulo) e `status = 'delivering'`, `out_for_delivery_at = now()`.
- Ao "entreguei": `status = 'delivered'`, `delivered_at = now()`.
- Ao "voltou": volta pra `status = 'picked'`, `courier_id = null`. Não estorna estoque.

### Cancelamento

- Pode cancelar em qualquer status que não seja `delivered`.
- Se status era `picked` ou `delivering`: lançar movimentação `cancellation_reversal` para cada item com `picked_grams > 0` (positivo, devolvendo ao estoque). `reference_id = order_id`.
- Setar `canceled_at`, `canceled_by`, `cancellation_reason`, `status = 'canceled'`.
- Cancelar pedido não apaga pagamentos já registrados — gerente trata manualmente (estorno é fora do sistema).

### Pagamento

- Soma de pagamentos pode ser menor, igual ou maior que `SUM(order_items.total_cents)`.
- Status de cobrança calculado em runtime: `paid` se soma >= total, `partial` se 0 < soma < total, `open` se 0.
- Pagamento `tab` (fiado) conta como pagamento "registrado" mas representa dívida — em relatórios de fiado, somar pagamentos com `method = 'tab'` por cliente.

### Estoque

- Saldo de `(picker_id, product_id)` = `SUM(grams) FROM stock_movements WHERE ...`.
- Nunca permitir saldo negativo via operação automática. Bloquear separação que faria saldo < 0.
- Ajuste de contagem: sistema calcula `delta = physical_grams - theoretical_grams` e lança movimentação `count_adjustment` com `grams = delta` (pode ser positivo ou negativo).
- Perda: gerente lança `loss` com `grams` negativo.

---

## 8. Estrutura de pastas

Inspirado no automanews mas com App Router e sem `src/`:

```
sacola/
├── app/                          # Next.js App Router (rotas)
│   ├── (public)/login/
│   ├── (manager)/admin/
│   ├── (seller)/seller/
│   ├── (picker)/picker/
│   ├── (courier)/courier/
│   └── api/v1/                   # endpoints REST + SSE
├── components/
│   ├── ui/                       # shadcn primitives (Button, Input, ...)
│   ├── auth/                     # LoginForm, LogoutButton
│   ├── order/                    # OrderCard, NewOrderForm, ItemPickingRow
│   ├── stock/                    # BalanceCard, PredictedBalanceBanner
│   ├── layout/                   # AppShell, TopBar, RoleSidebar
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── hooks/                        # React hooks (useSession, useOrders, useEventStream)
├── lib/                          # frontend helpers (cn, format, api fetcher)
├── infra/                        # backend infra
│   ├── compose.yaml              # local Postgres
│   ├── database.ts               # pg wrapper (query/getNewClient)
│   ├── errors.ts                 # custom error classes
│   ├── controller.ts             # errorToResponse, cookie helpers, canRequest, loadCurrentUser
│   ├── webserver.ts              # getOrigin()
│   ├── migrations/               # node-pg-migrate (forward-only)
│   └── scripts/                  # wait-for-postgres, seed, CLI helpers
├── models/                       # backend domain (queries + rules)
│   ├── user.ts
│   ├── client.ts
│   ├── product.ts
│   ├── picker-product.ts
│   ├── stock.ts
│   ├── order.ts
│   ├── payment.ts
│   ├── session.ts
│   ├── authentication.ts
│   ├── authorization.ts
│   └── password.ts
├── tests/
│   ├── unit/
│   ├── integration/api/v1/
│   ├── orchestrator.ts           # fetch helpers + clearDatabase + advisory lock setup
│   └── setup-jest.ts
├── .github/workflows/
├── package.json, tsconfig.json, ...
└── SETUP.md, README.md, panorama.html
```

---

## 9. Roadmap sugerido (4 semanas, solo)

### Semana 1 — fundação

- Setup do projeto (Next.js, TS, Tailwind, pg, node-pg-migrate, Neon, Vercel).
- Migrations de todas as tabelas.
- Seed básico (1 gerente, 1 vendedor, 1 separador, 1 entregador, 5 produtos, 2 clientes).
- Auth: login, logout, middleware por papel.
- Tela de login funcionando.

### Semana 2 — cadastros e estoque

- Telas e APIs de admin: usuários, clientes, produtos, catálogo separador × produto.
- Tela de admin/estoque: ver saldos, lançar abastecimento.
- Tela do separador: contagem manual.
- Função de cálculo de saldo (`SUM` da tabela ledger).

### Semana 3 — fluxo de pedido

- Tela do vendedor: criar pedido (com todas as validações).
- Tela do separador: fila, separação item a item, finalização.
- Movimentação de estoque na finalização da separação.
- Tela do entregador: fila, status de entrega.
- Cancelamento com estorno automático.

### Semana 4 — pagamento e polimento

- Registro de pagamento pelo vendedor.
- Confirmação de pagamento pelo gerente.
- Dashboard do gerente.
- Geração de código do pedido e tag de entrega.
- Logs de ação.
- Deploy em Vercel, banco em Neon de produção.
- Onboarding do cliente real.

---

## 10. O que NÃO fazer

- Não usar ORM. SQL direto via `pg`.
- Não usar float pra dinheiro nem peso.
- Não criar coluna `saldo_kg` atualizada — saldo é sempre derivado do ledger.
- Não permitir signup público.
- Não usar magic link / OAuth.
- Não tentar integrar WhatsApp no MVP.
- Não tentar conciliar extrato automático no MVP.
- Não criar formulário gigante de pedido — fluxo precisa ser rápido no celular.
- Não bloquear separação quando faltar 1 item de 10 — marcar item como falta e continuar.
- Não deletar registros — usar `ativo = false` ou status `cancelado`.

---

## 11. Decisões pendentes (definir durante a implementação)

- Formato exato da `delivery_tag` (iniciais + sufixo do dia? número sequencial? hoje sugestão é `iniciais-N`, ex: `MS-1`).
- Como representar produtos `unit = 'un'` na coluna de gramas (manter como 1 un = 1000g ou refatorar).
- Fuso horário: banco em UTC; **exibição em `America/Sao_Paulo`** (a confirmar).
- Política de logs em `action_logs` (mínimo a registrar: login, criação de usuário, troca de senha, criar/cancelar pedido, ajustes de estoque, confirmar pagamento).
- Limite exato do alerta de saldo previsto baixo (sugestão MVP: 10% do estoque ou ≤ 1 unidade).

---

## 12. Critérios de pronto pro MVP

O sistema está pronto pra ir pro cliente quando:

1. Os 3 vendedores conseguem lançar pedidos pelo celular em menos de 1 minuto cada.
2. Os 3 separadores conseguem ver sua fila e separar com pesagem.
3. Os 3 entregadores conseguem ver fila de pedidos prontos por tag.
4. O gerente consegue: cadastrar tudo, abastecer estoque, ver dashboard do dia, confirmar pagamentos.
5. Saldo de estoque está correto após 1 dia inteiro de uso real.
6. Nenhum dado é perdido em cancelamentos / estornos.
7. Login funciona em celular e desktop.
8. Deploy no Vercel + Neon estável.

---

## 13. Eventos em tempo real

Telas operacionais (separador, entregador, admin do dia) precisam refletir mudanças de estado dos pedidos **sem F5**. Decisão MVP:

- **SSE (Server-Sent Events) + polling no servidor a cada 10 segundos.**
- Implementação escondida atrás de uma função `watchChanges({since})` em `models/order.ts`.
- Cliente usa `EventSource("/api/v1/events/orders")`. Reconnect é automático no navegador.

### Por que polling em vez de `LISTEN/NOTIFY` puro

- Vercel Functions têm timeout (60s no Hobby, 800s no Pro). Manter uma conexão `LISTEN` aberta é viável mas caro.
- 10 segundos de latência é invisível no fluxo de hortifruti (separação leva minutos; entrega leva mais).
- `observarMudancas()` abstrai a implementação: trocar polling por `LISTEN/NOTIFY` puro depois é mudança local, sem mexer na rota SSE nem no cliente.

### Coluna obrigatória

Toda tabela observada em realtime tem `updated_at timestamptz NOT NULL DEFAULT now()` + trigger `BEFORE UPDATE` que reescreve para `now()`. Polling consulta `WHERE updated_at > $last_check`.

### Runtime

A rota SSE roda em **Node runtime** (não Edge), pra ter acesso ao `pg`. A função fica aberta por até ~50s e depois fecha; o cliente reconecta sozinho (gap ≤200ms).

### Fora do MVP

- **`pg_cron`** (extensão Postgres pra agendar jobs dentro do banco) — entra apenas em **fase 2**, se aparecer necessidade real (limpeza de sessões expiradas, snapshots periódicos de estoque). Não reservar tabela nem extension agora.
- **`LISTEN/NOTIFY` puro** com worker dedicado — fase 2, só se 10s de polling virar gargalo perceptível.
