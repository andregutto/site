# Voyage — Despesas por lugar + i18n cleanup (plano de execução)

Dois workstreams independentes. Podem ser feitos em PRs/commits separados.
Workstream A (despesas por lugar) é o maior; Workstream B (i18n) é mecânico mas amplo.

---

## Workstream A — Associar despesas a lugares

### Objetivo
Permitir vincular **uma ou mais transações** (`finance_transactions`) a um lugar da
viagem (`voyage_trip_places`), habilitando:
1. Total gasto por lugar no mapa da viagem (popup do marker).
2. Histórico completo de despesas por lugar.
3. Base para uma futura "visão de despesas no mapa" na página de Finanças.

### Decisão de modelagem (recomendada — confirmar antes de codar)
**Tabela de junção `voyage_place_expenses`**, NÃO uma coluna em `finance_transactions`.

Por quê:
- `finance_transactions` é por-usuário e estável; `voyage_trip_places` é denormalizado
  por-viagem e compartilhado entre colaboradores. Uma FK direta acoplaria finance ao
  domínio voyage de forma frágil (mesma despesa, lugares duplicados entre viagens).
- A junção mantém a despesa intacta (já carrega `amount`, `currency`, `date`,
  `description`, `category_id`) e o domínio voyage isolado.
- A "visão de despesas no mapa em Finanças" no futuro NÃO fica bloqueada: o `trip_place`
  já tem `lat`/`lng`, então um JOIN `finance_transactions → voyage_place_expenses →
  voyage_trip_places` resolve. Se mais tarde quiserem tag de lugar independente de viagem,
  é uma migration pequena adicional.

**Visibilidade — opcional por viagem:** o vínculo em si é sempre privado do dono na RLS
(`user_id = auth.uid()`). Mas a viagem ganha um flag `show_place_expenses BOOLEAN DEFAULT
FALSE` (em `voyage_trips`). Quando ligado, o **agregado por lugar** (total + contagem) é
exposto a colaboradores ativos e à página pública — calculado server-side com
`supabaseAdmin` (que ignora RLS), nunca a transação individual. Quando desligado, só o
dono vê. Reaproveita o padrão de `share_hide_cost` já existente.

- Toggle na UI: no `ShareModal` (página pública) e/ou num controle no CostCard/lugar.
- Endpoints de leitura (`/places`, `/map/places`, público) devolvem `expense_total`/
  `expense_count` para colaboradores **apenas se** `trip.show_place_expenses` (ou se for o
  dono). A lista detalhada de despesas (`GET …/expenses`) permanece restrita ao dono.

### Migration: `supabase/migrations/041_voyage_place_expenses.sql`
```sql
CREATE TABLE voyage_place_expenses (
  id             BIGSERIAL PRIMARY KEY,
  trip_place_id  BIGINT NOT NULL REFERENCES voyage_trip_places(id) ON DELETE CASCADE,
  transaction_id INT    NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  user_id        UUID   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_place_id, transaction_id)
);

ALTER TABLE voyage_place_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vpe_own" ON voyage_place_expenses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_vpe_trip_place  ON voyage_place_expenses(trip_place_id);
CREATE INDEX idx_vpe_transaction ON voyage_place_expenses(transaction_id);
CREATE INDEX idx_vpe_user        ON voyage_place_expenses(user_id);

-- Flag de visibilidade do agregado por lugar para colaboradores/público
ALTER TABLE voyage_trips ADD COLUMN show_place_expenses BOOLEAN NOT NULL DEFAULT FALSE;
```
> A leitura do agregado por colaboradores é feita no backend com `supabaseAdmin`
> (ignora RLS), gated por `voyage_trips.show_place_expenses`. A RLS estrita acima
> garante que ninguém leia o vínculo bruto de outro user via PostgREST direto.
Aplicar via Supabase MCP (`apply_migration`) no projeto `bkgpivxpzuzedezxtknd`.

### Backend — `frontend/api/_routes/voyage.ts`
Lembrar: paths NÃO incluem `/api`; usar `supabaseAdmin`; `uid(req)` para o user.

**Novos endpoints:**
1. `GET /voyage/trips/:id/places/:placeId/expenses`
   → lista vínculos do user para o lugar: `[{ id, transaction_id, date, amount,
   currency, description, category: {name, icon, color} }]` + `total`.
   Validar que o `placeId` pertence à `:id` e que o user é membro/dono da viagem.

2. `POST /voyage/trips/:id/places/:placeId/expenses`
   body: `{ transaction_ids: number[] }` (aceitar 1+). Insere vínculos
   (`upsert ... onConflict('trip_place_id,transaction_id') ignoreDuplicates`).
   Validar que cada `transaction_id` pertence ao user (`finance_transactions.user_id`).

3. `DELETE /voyage/trips/:id/places/:placeId/expenses/:transactionId` → remove vínculo.

4. `GET /voyage/trips/:id/transactions/candidates?q=&limit=`
   → transações do user para escolher. Ordenar por data desc. **Default:** transações
   que já pertencem aos momentos da viagem (JOIN `finance_transaction_moments` ∩
   `voyage_trip_moments` da viagem), excluindo as já vinculadas a QUALQUER lugar deste
   trip. **Fallback de busca livre** (`q`): qualquer transação do user no range de datas
   da viagem (`start_date`..`end_date`) cujo `description ILIKE %q%`. Retornar
   `{ id, date, amount, currency, description, category }`.

**Modificar endpoints existentes** para devolver agregado por lugar (só do user):
- `GET /voyage/trips/:id/places` e o bloco `places` de `GET /voyage/trips/:id`
- `GET /voyage/trips/:id/places` usado por `TripMapCard`
- `GET /voyage/map/places`
  → adicionar `expense_total` e `expense_count` em cada place. Fazer 1 query agregada:
  `select trip_place_id, sum(abs(amount)), count(*) from voyage_place_expenses
   join finance_transactions ... where user_id = uid group by trip_place_id`, depois
  mesclar no array de places (evitar N+1).

**`buildCostSummary`** (mesmo arquivo): adicionar `by_place: [{ trip_place_id, name,
total }]` (soma por lugar, só do user) ao retorno, para a expansão do CostCard. Manter
`by_category` já existente. Caso vazio: `by_place: []`.

### Frontend — types (`frontend/src/pages/voyage/types.ts`)
```ts
export interface PlaceExpense {
  id: number
  transaction_id: number
  date: string
  amount: number
  currency: string
  description: string
  category: { name: string; icon: string; color: string } | null
}
export interface CostByPlace { trip_place_id: number; name: string; total: number }
```
- Adicionar `expense_total?: number` e `expense_count?: number` em `TripPlace`.
- Adicionar `by_place: CostByPlace[]` em `TripCost`.
- Adicionar `show_place_expenses: boolean` em `Trip` (e expor no PATCH de trip / ShareModal).

### Frontend — componentes
1. **Novo `PlaceExpensesPanel.tsx`** (modal/sheet, padrão visual do `ShareModal`):
   - Header com nome do lugar.
   - Lista de despesas vinculadas (descrição, data, valor, categoria) + botão desvincular.
   - Busca + lista de candidatos (multi-select) → "Vincular selecionadas".
   - Estados loading/erro localizados (i18n).

2. **`TripPlacesPanel.tsx` / `PlaceRow`**:
   - Mostrar indicador quando `expense_total > 0`: ex. `€42 · 2 despesas` (cor neutra;
     vermelho só se quiser destaque de marca, com parcimônia).
   - Botão "💰 Despesas" abre `PlaceExpensesPanel`. Só quando `canEdit`.
   - Ao fechar o painel, recarregar places (atualiza o total).

3. **`TripMapCard.tsx` + `VoyageMapPage.tsx`**:
   - Popup do marker mostra `expense_total` quando > 0 ("Gasto aqui: €X").
   - Opcional: toggle "Mostrar gastos" que troca o rótulo do marker para o valor.

4. **`CostCard.tsx`**:
   - Na seção expandida, além de "Por categoria", adicionar aba/seção "Por lugar"
     usando `cost.by_place` (barras com `var(--arvo-fg-soft)`, sem excesso de vermelho).

### Regras de design (todos os componentes)
- Seguir as outras páginas do site; vermelho `#D63B2F` SÓ em destaque de marca / overbudget.
- Botões secundários: `var(--arvo-fg)` / `var(--arvo-bg)`; links de nav: `var(--arvo-fg-soft)`.
- Toda string nova via `t.voyage.*` (ver Workstream B).

### Verificação
- `npx tsc --noEmit` no `frontend/`.
- `npm run build` (Vercel roda `tsc -b && vite build`).
- Testar: vincular/desvincular, total no mapa e no card, candidatos filtrados por data/momento.

---

## Workstream B — i18n: mensagens de erro/confirmação/alerta em voyage

### Problema
~17 arquivos em `frontend/src/pages/voyage/` têm strings PT hardcoded: `confirm()`,
mensagens de erro (`err.message` / `setError('...')`), placeholders, labels e botões.
Não passam por `t.voyage.*`, então não traduzem para en/fr.

### Setup atual
- `useI18n()` → `t`, com `t.voyage` já existente (43 chaves em pt/en/fr — paridade ok).
- Arquivos i18n: `frontend/src/i18n/{pt,en,fr}.json`.

### Passos
1. **Inventariar** todas as strings PT visíveis ao usuário nos 17 arquivos voyage
   (incluindo `_shared/`). Os `confirm()` conhecidos:
   - `ShareTripPanel.tsx:45` — "Revogar o link? …"
   - `VoyagePlacesPage.tsx` — "Apagar TODOS os lugares…", `Remover "{name}" da biblioteca?`
   - `TripPlacesPanel.tsx` — `Remover "{name}" da viagem?`
   - `TripFormModal.tsx:33` — `Excluir "{title}" permanentemente? …`
   Mais: botões ("Copiar", "Gerando…", "Detalhar"/"Recolher"), placeholders
   ("Buscar…", URL do Maps), erros ("Erro ao importar", "Erro ao apagar"), e os strings
   novos do Workstream A.

2. **Estruturar chaves** sob `voyage` nos 3 JSONs. Sugestão de sub-objetos para organizar:
   ```json
   "voyage": {
     "confirm": {
       "revokeShare": "Revogar o link? Quem tiver o link não conseguirá mais acessar.",
       "deleteAllPlaces": "Apagar TODOS os lugares da biblioteca? Esta ação não pode ser desfeita.",
       "removePlaceFromLibrary": "Remover \"{name}\" da biblioteca?",
       "removePlaceFromTrip": "Remover \"{name}\" da viagem?",
       "deleteTripPermanent": "Excluir \"{title}\" permanentemente? Esta ação não pode ser desfeita."
     },
     "errors": {
       "import": "Erro ao importar",
       "delete": "Erro ao apagar",
       "generic": "Algo deu errado. Tente novamente."
     },
     "actions": { "copy": "Copiar", "copied": "Copiado", "generating": "Gerando…", ... },
     "expenses": { "title": "Despesas", "linkSelected": "Vincular selecionadas",
       "spentHere": "Gasto aqui", "byPlace": "Por lugar", ... }
   }
   ```
   Interpolação `{name}`/`{title}`: usar o mesmo mecanismo de `inviteNotifBody`
   (`{inviter}`/`{trip}` já existe) — verificar como é feito hoje e replicar (provável
   `.replace('{name}', value)` no call-site, já que `t` é objeto estático).

3. **Substituir** literais por `t.voyage.*` em cada componente. Componentes que ainda
   não usam `useI18n()` precisam importar (`const { t } = useI18n()`).

4. **Erros do backend:** `voyage.ts` devolve mensagens PT em `res.json({ error })` que
   aparecem via `err.message` no front. Duas opções:
   - **v1 pragmático:** traduzir só as strings client-side; para `err.message` do servidor,
     mostrar `t.voyage.errors.generic` como fallback localizado em vez do texto cru.
   - **futuro:** servidor retorna CÓDIGOS estáveis e o cliente mapeia. Documentar, não fazer agora.

5. **Paridade pt/en/fr:** garantir que TODA chave nova exista nos 3 arquivos. Validar:
   ```bash
   python3 -c "import json; a={*json.load(open('src/i18n/pt.json'))['voyage']}; \
   b={*json.load(open('src/i18n/en.json'))['voyage']}; c={*json.load(open('src/i18n/fr.json'))['voyage']}; \
   print('faltando en:', a-b); print('faltando fr:', a-c)"
   ```
   (Ajustar para sub-objetos aninhados.)

### Verificação
- `npx tsc --noEmit`.
- Trocar locale para en/fr e conferir que confirms/erros/labels traduzem.
- `grep` final por literais PT remanescentes nos arquivos voyage.

---

## Workstream C — Google Places autocomplete no campo Destino

### Objetivo
No `TripFormModal`, o campo **Destino** (e País) hoje é texto livre. Trocar por um input
com autocomplete do Google Places para padronizar a cidade canônica — isso melhora o
match do filtro por cidade no `LibraryPicker` (que já normaliza acentos) e permite
centralizar o mapa na cidade.

### Chave da API
A chave do Google Maps está nos documentos do projeto **"studio quartier"** — buscar lá.
- **Server-side only.** Adicionar como env var `GOOGLE_MAPS_API_KEY` (Vercel env + um
  `frontend/.env` local, que NÃO é commitado). NUNCA expor a chave no bundle do front nem
  commitá-la. Todas as chamadas ao Google passam pelo backend (proxy), seguindo o padrão
  do app (tudo via `/api` + `supabaseAdmin`/env no servidor).

### Backend — `frontend/api/_routes/voyage.ts`
- `GET /voyage/geo/autocomplete?q=&session=` → proxy para Google Places Autocomplete.
  Preferir **Places API (New)**: `POST https://places.googleapis.com/v1/places:autocomplete`
  com `{ input, includedPrimaryTypes: ["(cities)"], sessionToken }`. Retornar
  `[{ place_id, main_text, secondary_text }]`. Usar `session` token (gerado no front) para
  billing eficiente.
- `GET /voyage/geo/details?place_id=&session=` → Place Details (New):
  `GET https://places.googleapis.com/v1/places/{place_id}` com FieldMask para
  `displayName,addressComponents,location`. Retornar `{ city, country, lat, lng }`.
- Cachear com `lib/cache.ts` por `q`/`place_id` (TTL curto, ~minutos) para reduzir custo.
- Tratar ausência da key: se `GOOGLE_MAPS_API_KEY` não existir, retornar 200 com lista
  vazia (degrada para texto livre, sem quebrar o form).

### Frontend
- Novo `PlaceAutocompleteInput.tsx`: input controlado + dropdown de sugestões, debounce
  ~300ms, chama `/voyage/geo/autocomplete`. Ao selecionar uma sugestão, chama
  `/voyage/geo/details` e devolve `{ city, country, lat, lng }` via callback. Gera um
  session token (uuid) por sessão de digitação. Visual: mesmo `fieldStyle`/dropdown do
  `LibraryPicker`. Acessível por teclado (setas + Enter), fecha no blur/Esc.
- Em `TripFormModal`: usar no campo **Destino**. Ao selecionar, preenche `destination` com
  a cidade e auto-preenche `country` (ambos continuam editáveis para o caso de digitação
  manual). Se houver lat/lng e adotarmos `dest_lat/dest_lng`, salvar também.
- Strings via `t.voyage.*` (Workstream B).

### Migration (opcional, recomendada)
`ALTER TABLE voyage_trips ADD COLUMN dest_lat DOUBLE PRECISION, ADD COLUMN dest_lng DOUBLE
PRECISION;` — para o mapa centralizar na cidade mesmo sem lugares adicionados. Pode entrar
na mesma migration 041 ou numa 042. Expor no PATCH/POST de trip e no `Trip` type.

### Multi-cidade (Euro tour)
O autocomplete do destino é de **cidade única** (canônica). Para viagens multi-cidade, o
usuário deixa o destino como a cidade principal (ou vazio) e usa a **busca por cidade no
LibraryPicker** (já normaliza acentos) para montar o roteiro. NÃO criar array de destinos
nesta versão — fica como evolução futura se necessário.

### Reuso futuro (não fazer agora)
O mesmo `PlaceAutocompleteInput` pode, depois, alimentar a adição de lugares à biblioteca
(digitar nome → autocomplete → details → salvar com lat/lng), complementando o import por
URL/Takeout. Deixar arquitetado para isso, mas fora do escopo atual.

### Verificação
- Confirmar que a key NÃO aparece no bundle (`grep` no `dist/` após build).
- Testar autocomplete digitando uma cidade, selecionar, ver destination+country preenchidos.
- Sem key configurada: form continua funcionando como texto livre.

---

## Ordem sugerida
1. **A** (despesas por lugar) — entrega a feature maior.
2. **C** (autocomplete) — independente de A; pode ser feito em paralelo.
3. **B** (i18n) por último, cobrindo TODAS as strings de uma vez, inclusive as novas que
   A e C introduziram — evita extrair strings duas vezes.

Commits/PRs separados por workstream.
