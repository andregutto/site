# Arvo Voyage — Plano de Implantação (detalhado)

> Vertical de **Estilo de Vida & Viagens** do ecossistema Arvo.
> Acento: **Vermelho Guará `#D63B2F`** · texto sobre escuro `#FF8A84` · glifo `◈` · imagem Tier 1 `04-vista-trem.jpg`.
> Trabalho em fases: concluir → deploy → próxima fase. André revisa entre fases.
> **Executar com modelo Sonnet.** Cada fase tem escopo, backend, frontend e spec visual.

---

## 0. Princípios de integração

O Arvo tem 3 seções trocadas por pill no header: **Investimentos** (`/dashboard`…),
**Finanças** (`/finances/*`). Voyage entra como **3ª seção: Viagens** (`/voyage/*`),
mesmo padrão de `FinancesLayout` + sub-nav.

**Dual-server obrigatório** — toda rota nova em 2 arquivos idênticos:
`frontend/api/_routes/voyage.ts` (produção Vercel) + `backend/src/routes/voyage.ts` (dev).
Registrar nos dois `index.ts`. Migrações aplicadas **manualmente** no Supabase SQL Editor.

**Design system:** invocar a skill **`arvo-design`** antes de mexer em UI. Importa
`colors_and_type.css`. Superfície de produto = off-white `#F2EDE4`, cards brancos
`#FFFFFF` com borda hairline. Display = Tenor Sans (tracking generoso); body/dados = DM Sans;
acento editorial = Playfair Display itálico em dourado. Eyebrows UPPERCASE `0.30em`.
**Acento Voyage (vermelho) só em dados, ações e tags — nunca em fundo de seção.**

### Separação de responsabilidades

| Camada | Entidade | Responsável por |
|---|---|---|
| **Experiência** | `voyage_trips` (nova) | roteiro, mapa, lugares, página pública, colaboração |
| **Dinheiro** | `finance_moments` (existe) | custo realizado + budget, por usuário |
| **Colaboração** | `voyage_trip_members` (nova, espelha `shared_group_members`) | convite/edição multi-usuário |
| **Custo por pessoa** | `voyage_trip_moments` (nova) | cada colaborador anexa o próprio momento → split |

---

## 1. Decisões tomadas (2026-06-18)

| Decisão | Escolha | Motivo |
|---|---|---|
| Viagem × Momento | Tabela separada, ligação **N momentos** (1 por colaborador) | Não polui Finanças; habilita split por pessoa |
| Criação | **Bidirecional** — viagem cria/vincula momento; momento vira viagem | Sem cadastro duplo |
| Colaboração | Espelha `shared_groups` → `voyage_trip_members` | Reusa padrão de convite/RLS já validado |
| Mapa (exibição) | **Leaflet + OpenStreetMap** | Grátis, sem billing |
| Integração Google Maps | `google_place_id` + `google_maps_url` por lugar | Independe da lib de exibição |
| Import Google Maps | **Google Takeout** + biblioteca de lugares | Único caminho viável (sem API pública) |
| Lugares na viagem | **Denormalizados** em `voyage_trip_places` | Self-contained p/ multi-usuário e página pública |
| Próxima migração | **`040_voyage_tables.sql`** | Última é 039 |

### Por que Leaflet não compromete a integração Google
Salvar no Google Maps do seguidor vem de guardar `google_place_id` + `google_maps_url`:
link `?query_place_id=…` abre o pin exato (botão Salvar) e o download KML/GeoJSON importa
tudo no Google My Maps. Funciona desenhando o mapa com Leaflet.

### O problema "tudo na mesma pasta" (separação por cidade)
André salva lugares no Google Maps em listas por tipo (restaurantes, padarias, turismo),
todas as cidades misturadas. Solução: importar tudo **uma vez** para a biblioteca pessoal
(`voyage_places`) com categoria + lat/lng. Ao montar uma viagem, o sistema **filtra por
proximidade da cidade-destino** e André confirma. A biblioteca é reusada entre viagens.

### Custo por pessoa (multi-usuário)
Momentos são por usuário (cada um vê só os próprios). Numa viagem compartilhada, **cada
colaborador anexa o próprio momento** (`voyage_trip_moments`). O backend (service_role,
valida membership em código — igual `shared.ts`) soma os momentos e devolve total + split
por pessoa. Responde "quanto cada um pagou" reaproveitando o motor existente.

---

## 2. Schema — migração `040_voyage_tables.sql`

```sql
-- ── Viagens: camada de experiência ──────────────────────────────────────────
CREATE TABLE voyage_trips (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- owner
  title            TEXT NOT NULL,
  destination      TEXT,                              -- "Lisboa, Portugal" (display)
  country          TEXT,
  cover_image_url  TEXT,
  start_date       DATE,
  end_date         DATE,
  summary          TEXT,                              -- intro editorial da página pública
  status           TEXT NOT NULL DEFAULT 'planning'   -- planning | ongoing | past
                     CHECK (status IN ('planning','ongoing','past')),
  share_token      UUID UNIQUE DEFAULT NULL,
  share_expires_at TIMESTAMPTZ DEFAULT NULL,
  share_hide_cost  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Colaboradores (espelha shared_group_members) ────────────────────────────
CREATE TABLE voyage_trip_members (
  id                BIGSERIAL PRIMARY KEY,
  trip_id           BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_email      TEXT,
  invite_token      TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  role              TEXT NOT NULL DEFAULT 'editor'  CHECK (role IN ('owner','editor','viewer')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','left')),
  joined_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Custo por pessoa: cada colaborador anexa o próprio momento ───────────────
CREATE TABLE voyage_trip_moments (
  trip_id    BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  moment_id  BIGINT NOT NULL REFERENCES finance_moments(id) ON DELETE CASCADE,
  user_id    UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- dono do momento
  PRIMARY KEY (trip_id, moment_id)
);

-- ── Biblioteca pessoal de lugares (privada; fonte do import Takeout) ─────────
CREATE TABLE voyage_places (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         TEXT,                  -- restaurant|bakery|sight|bar|hotel|cafe|shop|other
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  address          TEXT,
  city             TEXT,                  -- derivado p/ filtro por cidade
  google_place_id  TEXT,
  google_maps_url  TEXT,
  notes            TEXT,
  source           TEXT NOT NULL DEFAULT 'takeout',   -- takeout | manual
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Lugares NA viagem (denormalizado; compartilhado entre colaboradores) ─────
CREATE TABLE voyage_trip_places (
  id               BIGSERIAL PRIMARY KEY,
  trip_id          BIGINT NOT NULL REFERENCES voyage_trips(id) ON DELETE CASCADE,
  added_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  library_place_id BIGINT REFERENCES voyage_places(id) ON DELETE SET NULL,  -- origem (opcional)
  name             TEXT NOT NULL,
  category         TEXT,
  lat              DOUBLE PRECISION,
  lng              DOUBLE PRECISION,
  address          TEXT,
  google_place_id  TEXT,
  google_maps_url  TEXT,
  day_number       INT,                   -- dia do roteiro (null = não agendado)
  sort_order       INT NOT NULL DEFAULT 0,
  is_highlight     BOOLEAN NOT NULL DEFAULT FALSE,
  rating           SMALLINT,              -- 1-5
  visited          BOOLEAN NOT NULL DEFAULT FALSE,
  trip_note        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS (mesmo espírito de shared_groups) ───────────────────────────────────
ALTER TABLE voyage_trips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_trip_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_trip_moments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_places        ENABLE ROW LEVEL SECURITY;
ALTER TABLE voyage_trip_places   ENABLE ROW LEVEL SECURITY;

-- helper: membro ativo da viagem
-- (em policy, usar EXISTS sobre voyage_trip_members WHERE status='active')

CREATE POLICY "trip_select" ON voyage_trips FOR SELECT TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trip_members m WHERE m.trip_id = voyage_trips.id
             AND m.user_id = auth.uid() AND m.status IN ('active','pending'))
);
CREATE POLICY "trip_insert" ON voyage_trips FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "trip_update" ON voyage_trips FOR UPDATE TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trip_members m WHERE m.trip_id = voyage_trips.id
             AND m.user_id = auth.uid() AND m.status = 'active' AND m.role IN ('owner','editor'))
);
CREATE POLICY "trip_delete" ON voyage_trips FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "tm_all"  ON voyage_trip_members FOR ALL TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
) WITH CHECK (true);

CREATE POLICY "tmom_all" ON voyage_trip_moments FOR ALL TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM voyage_trip_members m WHERE m.trip_id = voyage_trip_moments.trip_id
             AND m.user_id = auth.uid() AND m.status = 'active')
) WITH CHECK (user_id = auth.uid());

CREATE POLICY "places_own" ON voyage_places FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "tp_select" ON voyage_trip_places FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND (
    t.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM voyage_trip_members m WHERE m.trip_id = t.id
               AND m.user_id = auth.uid() AND m.status = 'active')))
);
CREATE POLICY "tp_write" ON voyage_trip_places FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM voyage_trips t WHERE t.id = trip_id AND (
    t.user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM voyage_trip_members m WHERE m.trip_id = t.id
               AND m.user_id = auth.uid() AND m.status = 'active' AND m.role IN ('owner','editor'))))
) WITH CHECK (true);

CREATE INDEX idx_voyage_trips_user         ON voyage_trips(user_id);
CREATE INDEX idx_voyage_trips_share_token  ON voyage_trips(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_vtm_trip                  ON voyage_trip_members(trip_id);
CREATE INDEX idx_vtm_user                  ON voyage_trip_members(user_id);
CREATE INDEX idx_vtm_token                 ON voyage_trip_members(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX idx_vtmom_trip                ON voyage_trip_moments(trip_id);
CREATE INDEX idx_voyage_places_user        ON voyage_places(user_id);
CREATE INDEX idx_voyage_places_city        ON voyage_places(user_id, city);
CREATE INDEX idx_voyage_trip_places_trip   ON voyage_trip_places(trip_id);

-- Seed do owner como membro ativo é feito no backend ao criar a viagem
-- (INSERT em voyage_trip_members role='owner' status='active').
```

> **Páginas públicas** usam service_role no route e validam `share_token` em código
> (igual `PublicMomentPage`) — não precisa policy pública.

---

## 3. Modelo de criação bidirecional

**Fluxo A — começa pela viagem (Voyage):**
1. Cria viagem (título, destino, datas). Sem momento ainda → status "planning".
2. Card "Custo" oferece: **[Vincular momento existente]** (picker `/moments-for-picker`)
   ou **[Criar momento]** (form inline: nome pré-preenchido com título da viagem, datas
   herdadas, budget opcional → `POST /moments` → `voyage_trip_moments`).

**Fluxo B — começa pelo momento (Finanças):**
1. No detalhe do momento, botão **"◈ Transformar em viagem"** (ou "Ver viagem" se já existir).
2. Cria `voyage_trips` herdando nome/datas/capa do momento + linka em `voyage_trip_moments`.

**Multi-usuário do custo:** cada colaborador, ao entrar na viagem, pode anexar **o próprio
momento** (o que ele gastou). O card de custo mostra **total + barra de split por pessoa**.

---

## 4. Fases

### V1 — Fundação: seção + DB + CRUD viagem + custo + criação bidirecional ⏳

**Escopo:** estrutura base, sem mapa/import/colaboração ainda (colaboração entra na V2).
O card de custo já é construído **split-ready** (estrutura de breakdown por usuário, mesmo
que com 1 pessoa só nesta fase) para a V2 só preencher.

**Backend** (`voyage.ts` dual-server):
- `GET /api/voyage/trips` — lista viagens do user (owner; membership entra na V2).
- `POST /api/voyage/trips` — cria viagem + seed do owner em `voyage_trip_members`.
- `GET /api/voyage/trips/:id` — viagem + lugares (vazio ainda) + custo agregado dos momentos.
- `PATCH /api/voyage/trips/:id` / `DELETE`.
- `POST /api/voyage/trips/:id/moments` — vincular momento existente.
- `POST /api/voyage/trips/:id/create-moment` — criar momento + vincular (Fluxo A).
- `DELETE /api/voyage/trips/:id/moments/:momentId` — desvincular.
- Reusar helpers de custo: somar `finance_transactions` dos momentos vinculados (service_role).
- Em Finanças: `POST /api/voyage/from-moment/:momentId` (Fluxo B).

**Frontend:**
- Pill **"Viagens"** no header (desktop + mobile bottom-nav), 3ª opção após Finanças.
- `default_section` do perfil aceita `'voyage'` (redirect no `App.tsx`).
- Rotas: `/voyage` (lista) com `VoyageLayout`; `/voyage/:id` (detalhe).
- `VoyageLayout` + sub-nav stubs: **Viagens** | Lugares (stub) | Mapa (stub).
- Lista: grid de cards de viagem.
- Detalhe: hero com capa, header com título/destino/datas/status, **card de Custo**
  (vincular/criar momento, mostra gasto + budget), seções stub "Roteiro" e "Lugares".
- Form de viagem (modal): título, destino, país, datas, status, capa (Supabase Storage,
  como os momentos), summary.
- Botão em `FinancesMomentsPage` (detalhe do momento): "◈ Transformar em viagem".

**Spec visual (V1):**
- Superfície off-white `#F2EDE4`. Eyebrow `◈ ARVO VOYAGE` UPPERCASE `0.30em`, cor vermelha.
- **Card de viagem:** branco, radius 14px, borda hairline `--arvo-border`, sem sombra
  (sombra só no hover `--arvo-shadow-md`). Topo: capa 16:9 com `.arvo-photo` (preset quente).
  Sobre a capa, gradiente de proteção (preto→transparente) — nunca pílula sólida. Título
  em Tenor Sans, destino em DM Sans muted, datas como tag pill. Badge de status no canto:
  *planning* (dourado), *ongoing* (vermelho, dot `● Em viagem`), *past* (cinza).
- **Card de Custo:** número grande em DM Sans tabular; gasto vs budget com barra. Verde
  Maritaca `#1F8A5B` se dentro do budget, vermelho `#D63B2F` se excedeu (regra de sentimento).
- Datas no locale: `12–18 jun 2026`. Botões: verbo primeiro, sem exclamação
  (*Adicionar viagem*, *Vincular momento*, *Criar momento*). Foco-visível: outline dourado 2px.
- Empty state: *"Nenhuma viagem ainda. Que tal planejar a primeira?"* (voz Arvo).
- Mobile: cards 1 coluna; sub-nav com `overflow-x-auto scrollbar-none` (padrão Segmented).

**Deploy.** ✅

---

### V2 — Colaboração multi-usuário (viagem compartilhada) 📋

**Escopo:** convidar outro usuário Arvo para co-editar a viagem; custo com split por pessoa.
Vem logo após a fundação porque molda o modelo de custo e a autoria desde cedo.

**Backend** (espelha `shared.ts`):
- `POST /api/voyage/trips/:id/invite` (email → cria `voyage_trip_members` pending +
  `invite_token` + notificação, igual convite de grupo). `getPendingTripInvites` em
  notificações.
- `GET /api/voyage/invite/:token` (público) + `POST /api/voyage/invite/:token/accept`
  (vira `AcceptInvitePage` genérica ou nova rota).
- Membros ativos: `GET /members`, `PATCH /members/:id` (role), `DELETE` (remover/sair).
- `POST /api/voyage/trips/:id/attach-my-moment` — colaborador anexa o próprio momento.
- `GET /api/voyage/trips/:id/cost` — total + **breakdown por usuário** (cada momento somado
  via service_role, validando membership). Preenche a estrutura split-ready da V1.
- RLS já cobre leitura/escrita compartilhada (ver §2).

**Frontend:**
- Painel **Colaboradores** na viagem: avatares dos membros, convidar por email, papéis,
  status pending/active. Reusar componentes de `SharedCategoriesPage`/`AcceptInvitePage`.
- Card de custo vira **split**: barra por pessoa (avatar + quanto pagou + %), total no topo.
- "Anexar meu momento" para o colaborador logado.
- Indicador de autoria nos lugares ("adicionado por X") — usado a partir da V4.

**Spec visual (V2):**
- Avatares em pílula com foto (fallback inicial em círculo dourado). Barra de split:
  segmentos coloridos por pessoa (paleta da marca), legenda com nome + valor (DM Sans tabular).
- Estados de convite sóbrios; voz Arvo nos textos ("Convide quem viajou com você").
- Notificação de convite reusa o padrão de `shared_group_invite`.

**Deploy.** ✅

---

### V3 — Biblioteca de Lugares + Import Takeout 📋

**Escopo:** importar e organizar os lugares salvos do Google Maps numa biblioteca pessoal.

**Backend:**
- `POST /api/voyage/places/import` — recebe arquivo Takeout (GeoJSON `Saved Places` e/ou
  CSV de Listas). Parseia, extrai nome, lat/lng, `google_place_id`/URL, e **categoria a
  partir do nome da lista/pasta** (mapa: "Restaurantes"→restaurant, "Padarias"→bakery,
  "Pontos turísticos"→sight, etc.). Dedup por `google_place_id`.
- `GET /api/voyage/places` — biblioteca com filtros (categoria, cidade, busca).
- `PATCH /api/voyage/places/:id` / `DELETE` / `POST` (manual).
- **Derivação de cidade:** reverse-geocode lat/lng via Nominatim (OSM), cachear por
  coordenada arredondada (respeitar rate limit 1 req/s). Preencher `city`.

**Frontend:**
- Sub-nav **Lugares** ativa. Tela: uploader (drag-drop do arquivo Takeout + instruções
  de como exportar), lista/grid de lugares com chip de categoria e cidade, filtros, busca.
- Editor inline de lugar (categoria, notas, cidade).

**Spec visual (V3):**
- Lugares como **linhas/cards compactos**: ícone de categoria (stroke 1.5px, single-color),
  nome (Tenor Sans), endereço (DM Sans muted), chips de categoria (pill, tinta vermelha
  `rgba(214,59,47,0.12)` texto `#FF8A84` no escuro / vermelho no claro) e cidade (cinza).
- Uploader: card tracejado, eyebrow `IMPORTAR DO GOOGLE MAPS`, passo-a-passo numerado do
  Takeout. Estado de progresso sóbrio (sem spinners chamativos).
- Filtros: `Segmented.tsx` por categoria; dropdown de cidade.

**Deploy.** ✅

---

### V4 — Montagem da viagem: mapa + roteiro 📋

**Escopo:** adicionar lugares à viagem (filtrados por cidade), mapa e roteiro por dia.

**Backend:**
- `GET /api/voyage/trips/:id/places` / `POST` (adiciona da biblioteca **ou** manual →
  denormaliza em `voyage_trip_places`) / `PATCH` (day_number, sort_order, highlight,
  rating, visited, note) / `DELETE`.
- `GET /api/voyage/places/near?city=…&trip_id=…` — sugere lugares da biblioteca por
  proximidade da cidade-destino, excluindo os já na viagem.

**Frontend:**
- Instalar **Leaflet** + tipos. Componente `<TripMap>` (tiles OSM, pins por categoria com
  cor, popup com nome + "abrir no Google Maps", cluster se muitos).
- Sub-nav **Mapa** ativa (mapa da viagem atual). No detalhe da viagem: aba **Roteiro**
  (lista por dia, drag-to-reorder, marcar visitado, highlight, nota) + aba **Mapa**.
- "Adicionar lugares": painel que filtra a biblioteca pela cidade da viagem (`/places/near`),
  multi-select, confirma.

**Spec visual (V4):**
- Mapa com borda hairline, radius 14px. Pins single-color por categoria (paleta da marca:
  azul arara, terracota, ocre, verde, dourado + vermelho p/ highlights). Sem neon/glow.
- **Roteiro por dia:** timeline vertical, cada dia é um header (Tenor Sans `Dia 1 · sex 12`),
  lugares como cards com handle de arraste, badge highlight (✦ dourado), checkbox "visitado".
- Animação de reveal 650ms `ease`, hover de card sutil (sombra md). Mobile: mapa colapsável
  acima do roteiro.

**Deploy.** ✅

---

### V5 — Página pública da viagem 📋

**Escopo:** página compartilhável rica para seguidores replicarem a viagem.

**Backend:**
- `POST /api/voyage/trips/:id/share` (gera `share_token`, expiry, toggle `share_hide_cost`)
  / `DELETE` (revoga).
- `GET /api/public/voyage/:token` (público, service_role, valida token) — devolve viagem,
  lugares, roteiro, custo (se não oculto), sem dados sensíveis dos colaboradores.
- `GET /api/public/voyage/:token/places.kml` e `.geojson` — download p/ Google My Maps.

**Frontend:**
- `PublicVoyagePage` em `/share/viagem/:token` (espelha `PublicMomentPage`).
- Hero escuro com capa (gradiente `.arvo-grain` opcional), eyebrow `◈ ARVO VOYAGE`,
  título Tenor Sans, summary em Playfair itálico dourado.
- Mapa público (Leaflet), roteiro por dia, lugares por categoria, **custo total opcional**.
- Bloco "Quer fazer essa viagem?": botão **Baixar lugares (KML)** + **(GeoJSON)** e, por
  lugar, link "abrir no Google Maps" (`?query_place_id=…`). CTA discreto pro Arvo.
- Toggle de compartilhamento na tela da viagem (igual painel de share dos momentos).

**Spec visual (V5):**
- Superfície **escura** (`--arvo-black`) — é marketing/vitrine, diferente do produto claro.
  Cards `#161513` com hairline escuro, topo opcional em vermelho Guará. Tipografia editorial.
- Mapa em "modo escuro" (tiles OSM dark ou overlay). Botões de download: outline dourado.
- Mobile-first: hero full-bleed, roteiro empilhado, mapa colapsável.

**Deploy.** ✅

---

## 5. Reuso direto do que já existe

| Precisa | Reusar de |
|---|---|
| Convite multi-usuário (token/email/status/RLS) | `shared_groups` + `shared_group_members` (`shared.ts`, mig. 031–033) |
| Aceitar convite | `AcceptInvitePage.tsx`, `/invite/:token`, `getPendingGroupInvites` |
| Custo agregado por categoria | `/moments/:id` summary (`finances.ts` ~L1931) |
| Picker de momento | `/moments-for-picker` |
| Página pública + token | `PublicMomentPage.tsx`, `/share/momento/:token`, mig. 012 |
| Upload de capa | fluxo de `cover_image_url` dos momentos (Supabase Storage) |
| Pill de seção + `default_section` | header + `App.tsx` (Investimentos/Finanças) |
| Sub-nav mobile sem overflow | padrão `Segmented.tsx` (`overflow-x-auto scrollbar-none`) |
| Ícones / sentimento de cor | skill `arvo-design`, `components/icons` |

---

## 6. Pendências a resolver em fase futura
- Definir papéis (`editor` vs `viewer`) e quem pode revogar share (V2).
- Validar formato exato do export Takeout com um export real do André (V3).
- Rate limit Nominatim → cachear cidade por coordenada arredondada (V3).
- Tiles dark do mapa na página pública (V5).
