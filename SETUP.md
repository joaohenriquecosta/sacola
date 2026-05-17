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
- **Pedido tem item com dois pesos:** `gramas_cotado` (o que vendedor lançou) e `gramas_separado` (o que separador pesou). Sistema cobra o separado.
- **Item não separado:** `gramas_separado = 0` significa falta de estoque, item vai como não entregue, pedido segue.
- **Tag de entrega:** decidir depois. No MVP, gerar string única curta (formato exato a definir).
- **Vendedor escolhe o separador** ao lançar o pedido. Sistema bloqueia se separador não tem o produto no catálogo dele.
- **Cancelamento de pedido separado:** estoque retorna automaticamente via movimentação tipada `estorno_cancelamento`.
- **Vendedor registra pagamento** (não entregador). Entregador só marca entregue.
- **Histórico de preço:** `pedido_itens.preco_kg_centavos_cotado` guarda snapshot do preço no momento da venda.
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
- **Sessão**: DB-backed (tabela `sessoes`), token opaco de 96 chars hex em cookie httpOnly + sameSite=lax + secure em prod. **Lifetime 6 horas** com refresh em uso (cobre um expediente de hortifruti). Revogação imediata por DELETE da linha.
- **Cookie**: `sacola_session_id`.
- **Autorização** feature-based no estilo automanews (`PERMISSIONS`, `isAuthorized`, `filterOutput`), com features **derivadas do `papel`** — sem coluna `features` na tabela.
- **Anti-timing**: dummy bcrypt hash quando login não existe (mesma latência do caminho válido).
- **Anti-enumeração**: erros de login não distinguem "login não existe" de "senha errada".
- **Rate limit**: fase 2 (não MVP).

---

## 4. Papéis e permissões

| Papel        | Pode fazer                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------- |
| `gerente`    | Tudo. Cadastra usuários, clientes, produtos, abastece estoque, ajustes.                     |
| `vendedor`   | Cria pedido, registra pagamento, vê seus pedidos, vê catálogo de cada separador.            |
| `separador`  | Vê fila de pedidos para si, registra peso, finaliza separação, faz contagem do seu estoque. |
| `entregador` | Vê fila de pedidos prontos, marca em rota, marca entregue.                                  |

---

## 5. Modelo de dados

Todas as tabelas em snake_case. IDs como `uuid` (gerar com `gen_random_uuid()` — habilitar `pgcrypto`). Timestamps em `timestamptz`.

### `usuarios`

```sql
id              uuid PK
nome            text NOT NULL
login           text UNIQUE NOT NULL
senha_hash      text NOT NULL
papel           text NOT NULL CHECK (papel IN ('gerente','vendedor','separador','entregador'))
ativo           boolean NOT NULL DEFAULT true
criado_em       timestamptz NOT NULL DEFAULT now()
```

### `clientes`

```sql
id                      uuid PK
nome                    text NOT NULL
telefone                text
endereco                text
iniciais                text  -- usado pra gerar tag de entrega futuramente
limite_fiado_centavos   integer NOT NULL DEFAULT 0
ativo                   boolean NOT NULL DEFAULT true
criado_em               timestamptz NOT NULL DEFAULT now()
```

### `produtos`

```sql
id                      uuid PK
nome                    text NOT NULL
unidade                 text NOT NULL CHECK (unidade IN ('kg','un'))
preco_centavos          integer NOT NULL  -- por kg se unidade=kg; por unidade se unidade=un
ativo                   boolean NOT NULL DEFAULT true
criado_em               timestamptz NOT NULL DEFAULT now()
```

### `separadores_produtos`

Relação N:N: quais produtos cada separador atende.

```sql
separador_id    uuid REFERENCES usuarios(id)
produto_id      uuid REFERENCES produtos(id)
ativo           boolean NOT NULL DEFAULT true
PRIMARY KEY (separador_id, produto_id)
```

### `movimentacoes_estoque`

O ledger. Saldo de um par (separador, produto) = `SUM(gramas)` desta tabela.

```sql
id              uuid PK
separador_id    uuid REFERENCES usuarios(id) NOT NULL
produto_id      uuid REFERENCES produtos(id) NOT NULL
gramas          integer NOT NULL  -- positivo = entrada, negativo = saída
tipo            text NOT NULL CHECK (tipo IN ('abastecimento','saida_pedido','ajuste_contagem','perda','estorno_cancelamento'))
referencia_id   uuid  -- ex: pedido_id quando tipo=saida_pedido ou estorno_cancelamento
observacao      text
criado_em       timestamptz NOT NULL DEFAULT now()
criado_por      uuid REFERENCES usuarios(id) NOT NULL
```

Índice em `(separador_id, produto_id)` pra calcular saldo rapidamente.

### `pedidos`

```sql
id                  uuid PK
codigo              text UNIQUE NOT NULL  -- código curto humano (ex: P-2026-0001)
cliente_id          uuid REFERENCES clientes(id) NOT NULL
vendedor_id         uuid REFERENCES usuarios(id) NOT NULL
separador_id        uuid REFERENCES usuarios(id) NOT NULL
entregador_id       uuid REFERENCES usuarios(id)  -- nulo até atribuir
tag_entrega         text  -- identificação curta (ex: #bjg-1) — formato definido em fase 2
status              text NOT NULL CHECK (status IN ('novo','em_separacao','separado','em_entrega','entregue','cancelado'))
observacao          text
criado_em           timestamptz NOT NULL DEFAULT now()
separado_em         timestamptz
em_entrega_em       timestamptz
entregue_em         timestamptz
cancelado_em        timestamptz
cancelado_por       uuid REFERENCES usuarios(id)
motivo_cancelamento text
```

### `pedido_itens`

```sql
id                          uuid PK
pedido_id                   uuid REFERENCES pedidos(id) ON DELETE CASCADE NOT NULL
produto_id                  uuid REFERENCES produtos(id) NOT NULL
gramas_cotado               integer NOT NULL  -- pra unidade=un, multiplicar por 1000 ou usar coluna separada se for refactor
gramas_separado             integer  -- NULL = ainda não separado; 0 = falta de estoque
preco_centavos_cotado       integer NOT NULL  -- snapshot do preço no momento da venda (por kg ou por un)
total_centavos              integer  -- calculado quando separado: round(gramas_separado * preco / 1000) pra kg
```

Observação sobre unidade `un`: tratar 1 unidade = 1000 gramas internamente, ou criar `quantidade` + `unidade` separados. **Decisão pro MVP:** manter `gramas_cotado`/`gramas_separado` mas para produtos `unidade=un` usar gramas como sinônimo de "milhares" (1 un = 1000) e ajustar formatação na UI. Refactor pra coluna dedicada vira fase 2 se ficar feio.

### `pagamentos`

```sql
id              uuid PK
pedido_id       uuid REFERENCES pedidos(id) NOT NULL
valor_centavos  integer NOT NULL
forma           text NOT NULL CHECK (forma IN ('pix','dinheiro','fiado'))
pago_em         timestamptz NOT NULL DEFAULT now()
registrado_por  uuid REFERENCES usuarios(id) NOT NULL
confirmado      boolean NOT NULL DEFAULT false  -- gerente confirma após ver extrato (fase 2 vira automático)
observacao      text
```

### `logs_acao`

Auditoria genérica. Opcional mas recomendado.

```sql
id              uuid PK
usuario_id      uuid REFERENCES usuarios(id) NOT NULL
acao            text NOT NULL  -- ex: 'pedido.criado', 'pedido.separado'
entidade        text NOT NULL  -- ex: 'pedido'
entidade_id     uuid NOT NULL
detalhes        jsonb
criado_em       timestamptz NOT NULL DEFAULT now()
```

---

## 6. Telas (MVP)

Mobile-first. Tudo responsivo. Sem app nativo.

### Públicas

- `/login` — usuário e senha.

### Gerente

- `/admin/usuarios` — lista, criar, ativar/desativar, resetar senha.
- `/admin/clientes` — lista, criar, editar, ajustar limite de fiado.
- `/admin/produtos` — lista, criar, editar preço (atenção: pedidos existentes mantêm preço antigo via snapshot).
- `/admin/catalogo` — matriz separador × produto, marcar quem atende o quê.
- `/admin/estoque` — saldo por separador × produto, lançar abastecimento, lançar perda.
- `/admin/pedidos` — visão geral do dia, filtros por status/separador/vendedor.
- `/admin/pagamentos` — lista, confirmar manualmente.

### Vendedor

- `/vendedor` — dashboard do dia (meus pedidos, pendentes de pagamento).
- `/vendedor/pedidos/novo` — escolhe cliente → escolhe separador → adiciona itens (valida catálogo do separador, valida estoque, valida limite de fiado).
- `/vendedor/pedidos/[id]` — detalhe, registrar pagamento, cancelar.

### Separador

- `/separador` — fila dos meus pedidos (novo, em_separacao) **+ banner de saldo previsto por produto após cumprir a fila** (estoque atual − reservado pela fila). Botão "começar separação".
- `/separador/pedidos/[id]` — lista de itens. Em cada item, ao pesar, mostrar: estoque agora, após este item, reservado pro resto da fila, sobra prevista (com alerta visual se vai estourar). Botão "marcar item separado / faltou", botão "finalizar separação".
- `/separador/contagem` — minha contagem manual: para cada produto meu, ver saldo teórico, registrar saldo físico, sistema lança `ajuste_contagem`.

### Entregador

- `/entregador` — fila de pedidos prontos, agrupada por onda do dia. Cada card mostra tag de entrega, endereço, valor a receber (informativo), forma de pagamento.
- `/entregador/pedidos/[id]` — botão "saí com este", botão "entreguei", botão "voltou (não entregou)".

---

## 7. Regras de negócio críticas

### Criação de pedido

- Cliente precisa estar ativo.
- Separador escolhido precisa estar ativo e ter papel = `separador`.
- Cada item precisa estar no catálogo do separador escolhido (`separadores_produtos` ativo).
- Se forma de pagamento prevista = fiado, validar `limite_fiado_centavos` do cliente vs débito atual + valor estimado do pedido. Se exceder, bloquear ou pedir aprovação do gerente (MVP: bloquear).
- Sistema gera `codigo` sequencial humano e `tag_entrega` (formato a definir).

### Separação

- Separador só vê pedidos onde `separador_id = ele`.
- Ao marcar item separado com peso: validar que `gramas_separado <= saldo atual`. Se exceder, separador pode marcar falta (`gramas_separado = 0`) ou ajustar.
- Ao finalizar separação: para cada item com `gramas_separado > 0`, lançar movimentação `saida_pedido` com `gramas = -gramas_separado`. Atualizar `pedidos.separado_em` e `status = 'separado'`. Calcular `total_centavos` por item.
- **Saldo previsto** (informativo, não bloqueia): para cada produto do catálogo do separador, calcular em runtime:
  - `saldo_atual` = `SUM(gramas)` em `movimentacoes_estoque`
  - `reservado` = `SUM(gramas_cotado)` de `pedido_itens` cujos pedidos têm `separador_id = ele` e `status IN ('novo','em_separacao')` e o item ainda não foi separado (ou usa `gramas_separado` se já foi)
  - `sobra_prevista` = `saldo_atual − reservado`
  - Alerta visual quando `sobra_prevista` < limite definido (sugestão MVP: alerta se ≤ 10% do `saldo_atual` ou ≤ 1 unidade pra produtos `un`).

### Entrega

- Entregador vê pedidos `status = 'separado'` sem `entregador_id`, ou com `entregador_id = ele`.
- Ao "sair com este": setar `entregador_id` (se nulo) e `status = 'em_entrega'`, `em_entrega_em = now()`.
- Ao "entreguei": `status = 'entregue'`, `entregue_em = now()`.
- Ao "voltou": volta pra `status = 'separado'`, `entregador_id = null`. Não estorna estoque.

### Cancelamento

- Pode cancelar em qualquer status que não seja `entregue`.
- Se status era `separado`, `em_entrega`: lançar movimentação `estorno_cancelamento` para cada item com `gramas_separado > 0` (positivo, devolvendo ao estoque). Referência = pedido.
- Setar `cancelado_em`, `cancelado_por`, `motivo_cancelamento`, `status = 'cancelado'`.
- Cancelar pedido não apaga pagamentos já registrados — gerente trata manualmente (estorno é fora do sistema).

### Pagamento

- Soma de pagamentos pode ser menor, igual ou maior que `SUM(pedido_itens.total_centavos)`.
- Status de cobrança calculado em runtime: `pago` se soma >= total, `parcial` se 0 < soma < total, `aberto` se 0.
- Pagamento `fiado` conta como pagamento "registrado" mas representa dívida — em relatórios de fiado, somar pagamentos com `forma = 'fiado'` por cliente.

### Estoque

- Saldo de `(separador_id, produto_id)` = `SUM(gramas) FROM movimentacoes_estoque WHERE ...`.
- Nunca permitir saldo negativo via operação automática. Bloquear separação que faria saldo < 0.
- Ajuste de contagem: sistema calcula `delta = gramas_fisico - gramas_teorico` e lança movimentação `ajuste_contagem` com `gramas = delta` (pode ser positivo ou negativo).
- Perda: gerente lança `perda` com gramas negativo.

---

## 8. Estrutura de pastas sugerida

Espelhar padrão do Automanews:

```
sacola/
├── infra/
│   └── migrations/              # node-pg-migrate
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── (auth)/login/
│   │   ├── (admin)/admin/
│   │   ├── (vendedor)/vendedor/
│   │   ├── (separador)/separador/
│   │   ├── (entregador)/entregador/
│   │   └── api/
│   ├── lib/
│   │   ├── db.ts                # pool do pg
│   │   ├── session.ts           # auth/cookie/JWT
│   │   └── money.ts             # helpers de centavos
│   ├── repos/                   # acesso a banco, uma função = uma operação
│   │   ├── usuarios.ts
│   │   ├── clientes.ts
│   │   ├── produtos.ts
│   │   ├── pedidos.ts
│   │   ├── estoque.ts
│   │   └── pagamentos.ts
│   ├── services/                # regras de negócio (orquestra repos)
│   │   ├── criar-pedido.ts
│   │   ├── finalizar-separacao.ts
│   │   ├── cancelar-pedido.ts
│   │   └── ...
│   └── components/
├── tests/
├── package.json
├── tsconfig.json
└── README.md
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

- Formato exato da `tag_entrega` (iniciais + sufixo do dia? número sequencial? hoje sugestão é `iniciais-N`, ex: `MS-1`).
- Como representar produtos `unidade = un` na coluna de gramas (manter como 1 un = 1000g ou refatorar).
- Fuso horário: banco em UTC; **exibição em `America/Sao_Paulo`** (a confirmar).
- Política de logs em `logs_acao` (mínimo a registrar: login, criação de usuário, troca de senha, criar/cancelar pedido, ajustes de estoque, confirmar pagamento).
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
- Implementação escondida atrás de uma função `observarMudancas({desde})` em `models/pedido.ts`.
- Cliente usa `EventSource("/api/v1/eventos/pedidos")`. Reconnect é automático no navegador.

### Por que polling em vez de `LISTEN/NOTIFY` puro

- Vercel Functions têm timeout (60s no Hobby, 800s no Pro). Manter uma conexão `LISTEN` aberta é viável mas caro.
- 10 segundos de latência é invisível no fluxo de hortifruti (separação leva minutos; entrega leva mais).
- `observarMudancas()` abstrai a implementação: trocar polling por `LISTEN/NOTIFY` puro depois é mudança local, sem mexer na rota SSE nem no cliente.

### Coluna obrigatória

Toda tabela observada em realtime tem `atualizado_em timestamptz NOT NULL DEFAULT now()` + trigger `BEFORE UPDATE` que reescreve para `now()`. Polling consulta `WHERE atualizado_em > $ultimo_check`.

### Runtime

A rota SSE roda em **Node runtime** (não Edge), pra ter acesso ao `pg`. A função fica aberta por até ~50s e depois fecha; o cliente reconecta sozinho (gap ≤200ms).

### Fora do MVP

- **`pg_cron`** (extensão Postgres pra agendar jobs dentro do banco) — entra apenas em **fase 2**, se aparecer necessidade real (limpeza de sessões expiradas, snapshots periódicos de estoque). Não reservar tabela nem extension agora.
- **`LISTEN/NOTIFY` puro** com worker dedicado — fase 2, só se 10s de polling virar gargalo perceptível.
