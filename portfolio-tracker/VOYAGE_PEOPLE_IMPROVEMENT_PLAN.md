# Plano de Melhorias — Voyage & Pessoas

> Inspeção de design/UX/funcionalidade das seções **Voyage** e **Pessoas**, com plano de execução
> para a próxima etapa. Objetivo: alinhar ao restante do site (Finances/Dashboard) e elevar a um
> padrão **premium**.
>
> Referências do design system (já existentes):
> - Fontes: `--arvo-font-display` (Tenor Sans), `--arvo-font-body` (DM Sans), `--arvo-font-serif` (Playfair Italic)
> - Cores: RED `#D63B2F`, GOLD `#C8B89A`, GREEN `#1F8A5B`, BLUE `#1B4FD8`
> - Tokens: `--arvo-surface`, `--arvo-border`, `--arvo-border-soft`, `--arvo-hover-bg`, `--arvo-fg`, `--arvo-fg-muted`, `--arvo-fg-soft`
> - Sombras: `--arvo-shadow-sm: 0 1px 2px rgba(13,13,13,0.04)`, `--arvo-shadow-md`, `--arvo-shadow-lg` (em `src/styles/colors_and_type.css`)
> - Convenção de card do resto do site: `bg-[var(--arvo-surface)] rounded-2xl border border-[var(--arvo-border)] shadow-sm`

---

## TIER 0 — Higiene & consistência (rápido, alto impacto visual)

Itens objetivos, baixo risco. Fazer todos de uma vez.

### 0.1 — Remover símbolo ◈ remanescente
Ainda há `◈` hardcoded em (foram trocados por SVG de paisagem nos cards principais, mas faltaram):
- `pages/voyage/VoyageMapPage.tsx:233` (empty state do mapa)
- `pages/voyage/TripPlacesPanel.tsx:361` (empty state de lugares da trip)
- `pages/voyage/PublicTripPage.tsx:159, 167, 196` (loader, erro, hero sem capa)
- `pages/voyage/AcceptTripInvitePage.tsx:111` (badge do convite)

**Ação:** substituir pelo mesmo SVG de linha (montanha + horizonte) usado em `VoyageTripsPage`/`VoyageTripDetailPage`, escalado ao tamanho do contexto. Em `AcceptTripInvitePage` (badge pequeno), usar o ícone de viagem do subnav.

### 0.2 — Apagar stubs mortos
`pages/voyage/VoyagePlacesStubPage.tsx` e `pages/voyage/VoyageMapStubPage.tsx` não são mais importados (confirmado via grep). **Ação:** deletar os dois arquivos.

### 0.3 — Dark mode na página pública
`pages/voyage/PublicTripPage.tsx` está **meio-tematizada**: usa `var(--arvo-fg)`/`var(--arvo-border)` mas tem `background: '#fff'` hardcoded em:
- linha 94 (cards de lugar)
- linha 239 (card de custo)

**DECIDIDO: tematizar.** Trocar os dois `#fff` (linhas 94 e 239) por `var(--arvo-surface)` e garantir que toda a página responda ao `ThemeContext` como as demais. Varrer o arquivo inteiro por qualquer outra cor hardcoded que não respeite o tema.

### 0.4 — Sombra e raio dos cards (alinhar ao resto do site)
Cards do Voyage usam `borderRadius: 14` **sem sombra**; o resto do site usa `rounded-2xl` (16px) + `shadow-sm`. Isso deixa o Voyage visualmente mais "plano"/menos premium.
**Ação:** padronizar todos os cards de Voyage/People para `borderRadius: 16` + `boxShadow: 'var(--arvo-shadow-sm)'`. Arquivos: `CostCard`, `ShareTripPanel`, `MembersPanel`, `TripPlacesPanel`, `VoyagePlacesPage` (cards), `VoyageMapPage` (sidebar), `PeoplePage` (ContactCard), `VoyageTripDetailPage` (card Roteiro).

### 0.5 — Cor fora da paleta no pill de custo
`VoyageTripsPage.tsx:96` usa `color: '#FF8A84'` (salmão) no pill de custo — não pertence à paleta. **Ação:** usar `RED` com `RED_SOFT` de fundo, ou GOLD. Padronizar com o pill de custo da página de detalhe.

---

## TIER 1 — Componentes compartilhados (reduz dívida e unifica visual)

Hoje há **duplicação** que gera inconsistência visual entre telas.

### 1.1 — `<Avatar>` unificado
Existem 2 implementações divergentes:
- `MembersPanel.tsx` → `Avatar` por iniciais do **nome**, fundo `--arvo-hover-bg` (monocromático)
- `PeoplePage.tsx` → `initials()` por **email**, fundo vermelho-tingido

**Ação:** criar `pages/voyage/_shared/Avatar.tsx` (ou `components/Avatar.tsx`) com props `{ name?, email?, size?, tone? }`. Iniciais derivadas de nome→email fallback. Usar em MembersPanel, PeoplePage, CostCard (split por pessoa).

### 1.2 — `<RoleChip>` e `<StatusChip>` unificados
Labels de papel divergem: MembersPanel usa "Owner/Editor/Leitor"; PeoplePage usa "Editor/Leitor". Status (ativo/pendente) também é re-estilizado em cada tela.
**Ação:** extrair `RoleChip` (owner/editor/viewer) e `StatusChip` (active/pending/left) para `_shared/`. Cores: editor=BLUE, viewer=neutro, owner=RED; active=GREEN, pending=GOLD.

### 1.3 — Split de custo com avatares reais
`CostCard.tsx:212-229` usa círculos numerados (1, 2, 3) no split por pessoa — impessoal. **Ação:** usar `<Avatar>` do membro (1.1). Requer que `cost.by_user` traga nome/email (verificar payload em `api/_routes/voyage.ts` `buildCostSummary`; hoje só tem `user_id`/`total` — **adicionar display name**).

---

## TIER 2 — Elevação premium (visual moderno)

### 2.1 — Mapa com tiles refinados + dark mode
`VoyageMapPage` usa tiles **OSM padrão** (coloridos, "pesados"), que destoam da paleta sóbria e **não acompanham dark mode**.
**Ação:** trocar o `TileLayer` para **CARTO** (gratuito, estética minimalista):
- claro: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- escuro: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
Selecionar a URL conforme `resolvedTheme` (via `ThemeContext`). Manter atribuição CARTO+OSM. Markers custom (divIcon) já estão bons.

### 2.2 — Movimento/entrada dos cards
Não há lib de animação (sem framer-motion). Para não adicionar dependência, usar **CSS**:
- Animação de entrada com stagger nos grids (trips, places, contatos): `@keyframes fadeUp` + `animation-delay` por índice (inline `style={{ animationDelay: \`${i*40}ms\` }}`).
- Hover dos `TripCard`: além da sombra, `transform: translateY(-2px)` suave (`transition: transform 280ms cubic-bezier(0.22,0.61,0.36,1)`).
Definir os keyframes em `colors_and_type.css` (lá já existe `@keyframes pulse`).

### 2.3 — Ícones de categoria de lugar
`VoyagePlacesPage`/`TripPlacesPanel`/Map usam **emoji** (🍽️ ☕ 🏛️…). Emoji renderiza diferente por SO e destoa do sistema de ícones SVG-line do resto do site.
**Ação (esforço médio):** criar set SVG-line monocromático para as ~12 categorias (restaurante, café, museu, hotel, bar, praia, parque, compras, ponto turístico, padaria, favorito, default). Fallback para emoji enquanto não houver SVG. Centralizar em `pages/voyage/_shared/categoryIcon.tsx` (hoje a lógica está duplicada em 3 arquivos).

### 2.4 — Hero da trip mais editorial
`VoyageTripDetailPage` hero está bom, mas pode subir de nível:
- Adicionar contador de lugares e dias no overlay (ex: "12 lugares · 5 dias") em chip discreto.
- Quando sem capa, o gradiente + SVG de linha está ok; considerar textura sutil ou inicial do destino em display grande translúcido.

---

## TIER 3 — Lacunas funcionais (UX)

### 3.1 — Roteiro: tirar o "em breve" (maior lacuna visível)
`VoyageTripDetailPage` mostra card **Roteiro → "Itinerário por dia — em breve"**. "Em breve" num produto premium passa inacabado.
**DECIDIDO: construir (A) — MVP do itinerário por dia.**
- Lista de lugares da viagem agrupada por `day_number` (campo já existe em `voyage_trip_places`).
- Cada lugar mostra nome, categoria, nota, marcado-visitado (reusar dados/UI do `TripPlacesPanel`).
- Atribuir/editar o dia de cada lugar inline (select/stepper de dia); lugares sem dia caem num grupo "Sem dia".
- **Read-first, sem drag-and-drop nesta etapa** (deixar reorder para iteração futura).
- Backend: endpoint para atualizar `day_number` de um trip_place (verificar se já existe PATCH em `api/_routes/voyage.ts` `/trips/:id/places/:placeId`; reaproveitar).
- Substituir o card stub "em breve" por este componente novo (`pages/voyage/TripItineraryPanel.tsx`).

### 3.2 — Filtro/busca na lista de viagens
`VoyageTripsPage` lista tudo sem filtro. Premium pede organização.
**Ação:** filtro segmentado por status (Planejando / Em viagem / Concluídas / Todas) + ordenação por data. Reusar estilo de pills do `ShareTripPanel`.

### 3.3 — Consistência de navegação (Link vs `<a onClick>`)
Vários "Ver mapa →" / "Ver momentos →" usam `<a href onClick={preventDefault+navigate}>`. **Ação:** trocar por `<Link>`/`<NavLink>` do react-router (acessibilidade + consistência). Arquivos: `VoyageTripDetailPage`, `CostCard`.

### 3.4 — "Ver momentos →" cross-section
`CostCard:173` linka p/ `/finances/moments` (outra seção) — mesma classe de problema que já corrigimos no fluxo de criação. Aqui é "ver" (aceitável), mas avaliar abrir os momentos **dentro do contexto da viagem** (modal/expand) em vez de jogar o usuário para Finances.

---

## TIER 4 — Seção Pessoas (evolução do modelo)

### 4.1 — Mostrar conexões inbound (bidirecional)
Hoje `GET /api/people` só agrega **outbound** (viagens/grupos que **eu** possuo). Não mostra viagens/categorias que **compartilharam comigo**.
**Ação:** estender a query para incluir:
- `voyage_members` onde `user_id = eu` e a trip **não** é minha (inbound de viagem)
- `shared_group_members` onde sou membro mas não criador (inbound de finanças)
Marcar cada contexto com direção (`owned_by_me` vs `shared_with_me`) e rotular na UI ("Você compartilha" / "Compartilhado com você").

### 4.2 — Popular `arvo_connections` (fundação de messaging)
A tabela `arvo_connections` (migration 041) existe mas está **vazia/não usada**. É o pré-requisito do fórum/mensagens futuras.
**Ação:** ao **aceitar** um convite (voyage `accept` e shared `accept`), fazer `upsert` em `arvo_connections` para ambos os lados (inviter↔invitee) com `status='active'`, `source`. Em `/api/people`, passar a unir com `arvo_connections` para ter uma lista de pessoas estável independente de contexto.

### 4.3 — Ação de convidar a partir de Pessoas
Página é hoje read+remove. **Ação (opcional):** botão "Convidar pessoa" que abre modal: escolher viagem/grupo destino + email + papel, reusando endpoints existentes. Fecha o ciclo da página como hub social.

### 4.4 — Nome real em vez de email
ContactCard mostra só email. Quando `user_id` existe, buscar display name (já há helper `userDisplay` no backend). **Ação:** `/api/people` retornar `name` quando disponível; UI mostra nome + email secundário.

---

## TIER 5 — Página pública premium (artefato de marca)

A página pública (`/trip/:token`) é o que **não-usuários** veem — deve ser a mais polida.

### 5.1 — Meta tags / Open Graph (link preview)
Quando compartilhado em WhatsApp/Telegram/redes, hoje não há card de preview rico.
**Ação:** injetar `document.title` + meta OG (título da viagem, descrição, imagem de capa) no `PublicTripPage`. Verificar se SSR/pré-render é necessário (Vercel) ou se basta meta dinâmica client-side para os crawlers usados.

### 5.2 — Branding "Feito com Arvo"
Rodapé discreto com wordmark Arvo + CTA sutil ("Crie seu roteiro no Arvo") — conversão + marca.

### 5.3 — Coerência de tema (ver 0.3)
Resolver o meio-termo de tema antes de polir o resto.

---

## Ordem de execução sugerida

1. **Tier 0** inteiro (1 commit) — higiene visível imediata.
2. **Tier 1** (1 commit) — componentes compartilhados; destrava consistência dos próximos.
3. **Tier 2.1 + 2.2** (mapa + motion) — maior salto de "premium" percebido.
4. **Tier 3.1** (Roteiro MVP) — remove o "em breve", maior lacuna funcional.
5. **Tier 4.1 + 4.2** (Pessoas bidirecional + arvo_connections) — fecha o modelo social.
6. **Tier 5** (página pública) — polir o artefato de marca.
7. **Tier 2.3** (ícones SVG de categoria) e **Tier 3.2/3.3/4.3** conforme fôlego.

## Notas técnicas para o executor
- **Dual-server:** toda rota nova/alterada existe em `frontend/api/_routes/*.ts` **e** `backend/src/routes/*.ts`. Sincronizar com:
  `sed 's|../_middleware/auth.js|../middleware/auth.js|g; s|../_lib/supabase.js|../lib/supabase.js|g'`
- **Migrations:** via MCP Supabase (`apply_migration`), project `bkgpivxpzuzedezxtknd`.
- **Validar:** `npx tsc --noEmit` no `frontend/` antes de cada commit.
- **Moeda:** Voyage usa `Intl.NumberFormat` local (EUR), **não** o `fmt` do CurrencyContext (que converte de BRL).
