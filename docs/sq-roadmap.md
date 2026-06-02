# Studio Quartier — Roadmap de Desenvolvimento

## Stack técnica

- **Next.js 16** App Router — `src/app/`
- **Supabase** — banco de dados (projeto `euqlzbzfvljgkdrcgpzd`)
- **Vercel** — deploy em `sq.andregutto.com`
- **Anthropic Claude** — Haiku (chain detection) + Sonnet (análise, diagnóstico, devis)
- **Design system** — `src/lib/sq-design.ts` (C.paper, C.ink, C.warm, C.muted, C.accent)
- **i18n** — PT + FR via `src/lib/i18n/`
- **Domínio futuro** — `studioquartier.fr` (registrado na OVH)

---

## Tabelas Supabase

| Tabela | Uso |
|---|---|
| `sq_clients` | CRM — dossiers dos clientes |
| `sq_places` | Prospects identificados via Google Places |
| `sq_runs` | Histórico de buscas de prospecção |
| `sq_run_places` | Relação run ↔ places |
| `sq_client_events` | Timeline de atividades por cliente |
| `sq_briefings` | Formulários de briefing por cliente (token único) |
| `sq_devis` | Propostas comerciais por cliente |
| `sq_checklists` | Checklists mensais por cliente |
| `sq_diagnostics` | Diagnósticos IA por cliente (histórico de versões) |
| `sq_services` | Catálogo de serviços com preços |
| `sq_invoices` | Faturas por cliente (numeração SQ-YYYY-NNN) |
| `sq_calendar_posts` | Calendário editorial por cliente |
| `sq_rapports` | Relatórios mensais por cliente |

---

## Ferramentas implementadas

### Prospecção (`/tools/prospect`)
- [x] Busca Google Places com multi-select de arrondissements e categorias
- [x] Categorias reais do Google Places (sem tipos falsos)
- [x] Análise IA por prospect: score, serviços sugeridos, qualidade review
- [x] `review_response_quality`: NONE / INCONSISTENT / HUMAN
- [x] Detecção de chain/franquia (Claude Haiku antes da análise completa)
- [x] Catálogo de serviços injetado no prompt — Claude só sugere serviços do catálogo

### Histórico (`/tools/prospect/historique`)
- [x] Dois tabs: histórico de buscas + todos os prospects
- [x] Filtros: score, site, instagram, qualidade de review, categoria Google
- [x] Mapa de prospects (ambos os tabs)
- [x] Stats strip: total, sem site, score médio, sem resposta a avis

### CRM (`/tools/clients`)
- [x] Pipeline de status: prospect → en_approche → rdv → devis_envoye → negocia → gagne → actif → perdu
- [x] Exportação Excel

### Dossier do cliente (`/tools/clients/[id]`)
- [x] KPI strip: score potencial, nota Google, site, resposta avis, Instagram
- [x] Action bar: Diagnostic, Devis, Rapport, Calendrier, Facturation + Briefing
- [x] 3 colunas: Contact & liens | Services a proposer | Timeline
- [x] Google Drive URL por cliente
- [x] Timeline de atividades: collapsible form, filtros, editar/deletar eventos
- [x] Checklist mensal com navegação de meses (‹ ›) e tarefas customizadas
- [x] Tarefas customizadas carregadas automaticamente no mês seguinte
- [x] Visualizador das respostas do briefing (banner "Voir les réponses" quando preenchido)

### Briefing (`/tools/briefing/[token]`)
- [x] Formulário digital por link único por cliente
- [x] Perguntas adaptadas por categoria (restaurant, beauty_salon, spa, etc.)
- [x] Respostas salvas no Supabase
- [x] Injetadas no diagnóstico IA e no devis IA automaticamente

### Diagnóstico IA (`/tools/clients/[id]/diagnostic`)
- [x] Claude Sonnet gera: headline, intro, oportunidades, closing
- [x] Usa sinais internos + briefing preenchido pelo cliente
- [x] Histórico de versões salvas no DB
- [x] Export PDF via `window.print()`

### Devis (`/tools/clients/[id]/devis/[devisId]`)
- [x] Editor com itens do catálogo, preços setup + mensal
- [x] Auto-populate dos serviços sugeridos na criação
- [x] Geração IA: intro personalizada + descrição por serviço (usa briefing)
- [x] Status: draft → sent → accepted → refused
- [x] Botão "Créer une facture →" quando status = accepted
- [x] Preview + export PDF

### Rapport mensuel (`/tools/clients/[id]/rapport`)
- [x] Template estruturado (sem IA): auto-fill da checklist + eventos do mês
- [x] Todos os campos editáveis inline
- [x] Histórico de versões salvo no DB
- [x] Export PDF

### Calendário editorial (`/tools/clients/[id]/calendrier`)
- [x] Vista mensal por cliente
- [x] Plataformas: Instagram, Facebook, Google, TikTok
- [x] Status: idée → à créer → prêt → publié
- [x] Modal de criação/edição com conteúdo e status

### Faturamento (`/tools/clients/[id]/faturamento`)
- [x] Editor de faturas com itens e preços
- [x] Criação a partir do devis aprovado (pré-populate automático)
- [x] Numeração sequencial: SQ-YYYY-NNN (reinicia por ano)
- [x] Status: brouillon → envoyée → payée com datas
- [x] Preview + export PDF com TVA 20%

### Calendário global (`/tools/calendrier`)
- [x] Vista mensal de todos os clientes juntos
- [x] Filtros por cliente (cor por cliente) e por plataforma
- [x] Stats: total posts, publicados, em andamento, clientes ativos

### Painel financeiro (`/tools/finances`)
- [x] KPIs: total faturado, encaissado, em espera, rascunhos
- [x] Gráfico de barras cash flow por mês (faturado vs recebido)
- [x] Tabela de todas as faturas com filtros status + cliente
- [x] Marcar paga/enviada diretamente na tabela

### Catálogo de serviços (`/tools/services`)
- [x] CRUD completo: nome, categoria, descrição, preço setup, mensal
- [x] Agrupado por categoria
- [x] Ativo/inativo por serviço
- [x] Seed com 10 serviços padrão de mercado Paris

---

## Roadmap futuro

### Quando tiver clientes ativos
- [ ] **Portal do cliente** — área autenticada (acesso por token), vê diagnóstico, relatórios, aprovação de posts
- [ ] **Número sequencial por ano com reset** — já implementado, melhorar se necessário

### Integrações
- [ ] **Google Business Profile API** — publicar posts diretamente do calendário
- [ ] **Instagram Graph API** — agendar publicações
- [ ] **Stripe** — pagamento de faturas online
- [ ] **Multi-usuário** — outros colaboradores com acesso

### Site público `studioquartier.fr`
- [x] Landing page básica
- [ ] Página de serviços detalhada
- [ ] Casos de sucesso / clientes
- [ ] Formulário de contato → novo prospect entra direto no CRM
