# Arvo Comunidade — Plano de Implementação

> 4ª vertical do ecossistema Arvo. Acento **Ocre Tucano `#E8A020`** (já reservado
> no design system como a cor de "comunidade"). Comunidade **fechada** (só usuários
> logados do Arvo), modelada genericamente (tópicos/posts) para permitir migração
> futura ao Discourse se a audiência crescer. Preparada desde já para um **tier pago**
> futuro, sem precisar migrar dados depois.

---

## 1. Decisões de produto (alinhadas com o André)

- **Objetivo:** mistura de (a) discussão geral + suporte/feedback sobre o Arvo e
  (b) compartilhar viagens/roteiros entre usuários. Um tópico pode opcionalmente
  referenciar uma viagem pública existente (integração com Voyage).
- **Localização:** seção própria no header (4º pill: Patrimônio / Finanças / Viagens / **Comunidade**).
- **Acesso:** **fechado** — todo conteúdo exige conta Arvo logada. Sem leitura pública
  na V1 (decisão: SEO não é alavanca relevante aqui; a audiência chega via YouTube, e
  exclusividade é parte do valor → futuro tier pago). Campo `tier` preparado no modelo,
  mas só `free` existe na V1.
- **Moderação V1:** simples. Autor edita/apaga o próprio conteúdo; um admin (André,
  por UUID hardcoded em env/const) pode apagar qualquer coisa e fixar/trancar tópicos.
  Sem painel de moderação dedicado ainda.

---

## 2. Modelo de dados (migration `053_community.sql`)

Genérico de propósito (topics + posts + categories), espelha o vocabulário do Discourse
para facilitar export futuro.

```sql
-- Categorias do fórum (seed fixo na V1, editável só por admin no futuro)
CREATE TABLE community_categories (
  id          BIGSERIAL PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,         -- 'geral', 'suporte', 'sugestoes', 'viagens'
  name_key    TEXT NOT NULL,               -- chave i18n: 'community.cat.geral' etc.
  icon        TEXT,                         -- emoji
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tópico = thread. O primeiro post vem junto na criação.
CREATE TABLE community_topics (
  id              BIGSERIAL PRIMARY KEY,
  category_id     BIGINT NOT NULL REFERENCES community_categories(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  linked_trip_id  BIGINT REFERENCES voyage_trips(id) ON DELETE SET NULL,  -- integração Voyage
  pinned          BOOLEAN NOT NULL DEFAULT FALSE,
  locked          BOOLEAN NOT NULL DEFAULT FALSE,
  reply_count     INTEGER NOT NULL DEFAULT 0,   -- denormalizado (atualizado no insert/delete de post)
  last_post_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_community_topics_category ON community_topics(category_id, pinned DESC, last_post_at DESC);

-- Post = mensagem dentro de um tópico (inclui o primeiro post do autor).
CREATE TABLE community_posts (
  id          BIGSERIAL PRIMARY KEY,
  topic_id    BIGINT NOT NULL REFERENCES community_topics(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,                 -- soft delete (mantém a thread coerente)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_community_posts_topic ON community_posts(topic_id, created_at);

-- Curtidas em posts (suporta o "like" estilo trocar dicas/roteiros).
CREATE TABLE community_post_likes (
  post_id     BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- Membership/tier — preparado pra monetização futura; V1 cria 'free' on-first-visit.
CREATE TABLE community_members (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'paid' (futuro)
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed de categorias iniciais
INSERT INTO community_categories (slug, name_key, icon, sort_order) VALUES
  ('geral',     'community.cat.geral',     '💬', 0),
  ('suporte',   'community.cat.suporte',   '🛟', 1),
  ('sugestoes', 'community.cat.sugestoes', '💡', 2),
  ('viagens',   'community.cat.viagens',   '🧭', 3);
```

Observações:
- `reply_count` e `last_post_at` denormalizados no tópico para a lista carregar rápido
  sem agregação (atualizados pelo backend ao criar/apagar post).
- RLS: tabelas têm RLS habilitado mas o `supabaseAdmin` (service_role) bypassa — toda
  autorização é validada no código do router (mesmo padrão do resto do app).
- Migração aplicada manualmente via Supabase (MCP `apply_migration`) + arquivo commitado.

---

## 3. Backend — `shared-api/src/routes/community.ts`

Novo router montado em `/api/community` nos dois arquivos (`backend/src/index.ts` e
`frontend/api/_app.ts`), seguindo o padrão dual-server já existente. Reusa `requireAuth`,
`uid()` e `userDisplay()` (versão de `people.ts`, que inclui `username`).

Constante de admin: `const ADMIN_USER_IDS = new Set([process.env.COMMUNITY_ADMIN_ID ?? '<andré-uuid>'])`.

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET`  | `/categories` | Lista categorias + contagem de tópicos por categoria. Garante `community_members` (upsert free) no primeiro acesso. |
| `GET`  | `/categories/:slug/topics` | Tópicos da categoria, fixados primeiro, depois por `last_post_at` desc. Inclui autor (display) e `reply_count`. Paginação simples por cursor (`?before=<iso>`). |
| `POST` | `/topics` | Cria tópico `{ category_slug, title, body, linked_trip_id? }` — cria o tópico + primeiro post numa transação lógica. Valida `linked_trip_id` pertence a uma viagem com `share_token` (pública) do próprio usuário. |
| `GET`  | `/topics/:id` | Detalhe: tópico (título, autor, flags, viagem vinculada resolvida p/ card) + posts não-deletados, com autor e `like_count`/`liked_by_me`. |
| `POST` | `/topics/:id/posts` | Responde no tópico `{ body }`. Rejeita se `locked` (a não ser admin). Atualiza `reply_count` + `last_post_at`. |
| `PATCH`| `/posts/:id` | Edita o próprio post `{ body }` (ou admin). Seta `edited_at`. |
| `DELETE`| `/posts/:id` | Soft-delete do próprio post (ou admin). Se for o 1º post do tópico → soft-delete do tópico inteiro. |
| `POST` | `/posts/:id/like` | Toggle like (insert/delete em `community_post_likes`). Retorna novo `like_count`/`liked_by_me`. |
| `PATCH`| `/topics/:id` | **Admin only**: `{ pinned?, locked? }`. |
| `DELETE`| `/topics/:id` | Autor ou admin: soft-delete (marca todos os posts deleted_at). |

Shapes de resposta tipados em `community.ts` (interfaces exportadas) e espelhados no
frontend em `frontend/src/pages/community/types.ts`.

### Integração Voyage (tópico ↔ viagem)
- `linked_trip_id` referencia `voyage_trips`. No `GET /topics/:id`, o backend resolve a
  viagem vinculada para `{ id, title, destination, cover_image_url, share_token }` e o
  frontend mostra um card clicável que leva à página pública `/trip/:share_token`.
- Ao criar tópico na categoria "viagens", o seletor opcional "vincular uma das minhas
  viagens públicas" lista `GET /voyage/trips` filtrando as que têm `share_token`.

---

## 4. Frontend — páginas e rotas

Estrutura espelha o padrão Voyage (Layout + Index + Detail).

```
frontend/src/pages/community/
  CommunityLayout.tsx          # wrapper com sub-nav (categorias) + <Outlet/>
  CommunityHomePage.tsx        # lista de categorias (cards) + "tópicos recentes" geral
  CommunityCategoryPage.tsx    # tópicos de uma categoria + botão "Novo tópico"
  CommunityTopicPage.tsx       # tópico: 1º post + respostas + caixa de resposta
  NewTopicModal.tsx            # criar tópico (título, corpo, categoria, vincular viagem)
  _shared/PostCard.tsx         # avatar+@username (reusa Avatar de voyage/_shared), corpo, like, editar/apagar
  types.ts
```

### Rotas (`App.tsx`, dentro de `ProtectedRoutes`)
```tsx
<Route path="/community" element={<CommunityLayout />}>
  <Route index                     element={<CommunityHomePage />} />
  <Route path=":slug"              element={<CommunityCategoryPage />} />
  <Route path=":slug/:topicId"     element={<CommunityTopicPage />} />
</Route>
```
Sem rota pública na V1 (acesso fechado). Se virar prévia pública no futuro, adicionar
`/c/:slug/:topicId` fora do ProtectedRoutes.

### Header (`AppLayout.tsx`)
- `const inCommunity = location.pathname.startsWith('/community')`.
- Adicionar pill desktop `{ to: '/community', label: t.nav.community, active: inCommunity }`.
- Adicionar item mobile bottom-nav com `accent: '#E8A020'` + ícone (balão de conversa).
- `sectionAccent`: branch `inCommunity ? '#E8A020'`.
- Sub-nav (`activeSubItems`): categorias como sub-itens quando `inCommunity`.

---

## 5. Design / UX

Segue o design system Arvo (tokens `--arvo-*`, fontes Tenor Sans / DM Sans, acento ocre
`#E8A020` só em ações/tags desta seção — nunca como fundo de área).

- **Home da comunidade:** eyebrow "ARVO COMUNIDADE" (ocre), título "Comunidade".
  Grid de cards de categoria (ícone, nome, nº de tópicos, último ativo). Abaixo, um
  feed "Conversas recentes" (tópicos mais ativos de todas as categorias).
- **Categoria:** lista de tópicos (linha: título, autor avatar+@, nº respostas, tempo do
  último post; tópicos fixados com marcador). Botão "+ Novo tópico" no topo (ocre).
- **Tópico:** cabeçalho com título + (se vinculado) card da viagem pública. Lista de
  posts (PostCard: avatar, nome+@username, corpo, tempo, like com contagem, ações de
  editar/apagar no próprio). Caixa de resposta fixa no fim (escondida se `locked`).
  Admin vê controles de fixar/trancar.
- **NewTopicModal:** título, categoria (pré-selecionada se veio de uma), corpo (textarea),
  e — só na categoria "viagens" ou sempre opcional — seletor "vincular viagem pública".
- **Estados vazios:** mensagem em serif itálico dourado (padrão do app). Loading com
  `ArvoLoader` / skeleton `pulse` (padrão existente).
- **Dark mode:** usa tokens semânticos, herda automaticamente.
- **i18n:** bloco `community` em pt/en/fr (`nav.community`, `community.cat.*`,
  títulos, botões, placeholders, confirmações). Sem texto hardcoded.

---

## 6. Integração com recursos existentes

- **Autenticação:** `requireAuth` no backend; `ProtectedRoutes` no frontend. Membership
  `free` criada no primeiro acesso a `/api/community/categories`.
- **Identidade:** reusa `userDisplay()` (nome, avatar, **@username** do `user_handles`)
  e o componente `Avatar` de `voyage/_shared`. @username já existe na plataforma.
- **Voyage:** tópicos podem linkar viagens públicas (`share_token`) → card + deep-link
  pra `/trip/:token`. Reaproveita `GET /voyage/trips`.
- **Notificações (futuro, fora da V1):** o feed de notificações já existe
  (`notifications.ts`, padrão `getRecent*`/`getPending*`). Uma resposta no seu tópico
  poderá virar `community_reply` no mesmo pipeline — deixar o gancho previsto, não construir.
- **Dual-server / deploy:** rota nova nos dois arquivos de mount; migração manual no
  Supabase; verificação pós-deploy com `vercel list` + `/api/health` (200) como sempre.

---

## 7. Escopo

### V1 (este plano)
1. Migration `053_community.sql` + seed de categorias.
2. Router `community.ts` (categorias, tópicos, posts, likes, admin pin/lock, soft-delete).
3. Pill "Comunidade" no header (desktop + mobile) com acento ocre + i18n.
4. Páginas: Home (categorias + recentes), Categoria (lista de tópicos), Tópico (posts +
   resposta), NewTopicModal (com vínculo opcional de viagem).
5. PostCard com like, editar/apagar próprio, e controles de admin.
6. i18n pt/en/fr completo.

### Fora da V1 (futuro, ganchos preparados)
- Notificações de resposta/menção (reusar pipeline de `notifications.ts`).
- Busca de tópicos.
- Painel de moderação / reports.
- **Tier pago** (campo `tier` já existe) — gating de categorias premium, paywall.
- Prévia pública + SEO (se a estratégia mudar).
- Rich text / imagens nos posts (V1 é texto puro com quebras de linha).
- Migração export → Discourse (modelo já compatível: categories/topics/posts).

---

## 8. Ordem de implementação (tasks)

1. `053_community.sql` — criar tabelas + seed + aplicar no Supabase.
2. Backend `community.ts` — endpoints + mount nos 2 arquivos; tipos exportados.
3. i18n — bloco `community` + `nav.community` (pt/en/fr).
4. Header — pill desktop/mobile + sub-nav + sectionAccent (ocre).
5. Rotas em `App.tsx` + `CommunityLayout`.
6. `CommunityHomePage` (categorias + recentes).
7. `CommunityCategoryPage` (lista de tópicos) + `NewTopicModal`.
8. `CommunityTopicPage` + `PostCard` (posts, resposta, like, editar/apagar).
9. Controles de admin (pin/lock/delete) + vínculo de viagem no card do tópico.
10. Verificação: tsc (front+back), build, deploy, `/api/health` 200.
