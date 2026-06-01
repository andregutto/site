# Studio Quartier — Roadmap de Desenvolvimento

## Ferramentas internas (já construídas)

- [x] Prospecção com Google Places API + análise IA por arrondissement
- [x] Multi-select de arrondissements e categorias no dropdown
- [x] Análise de resposta a reviews Google (review_response_quality)
- [x] Histórico de buscas com tabela + mapa + filtros avançados
- [x] Vista "Tous les prospects" com filtros: score, site, instagram, qualidade, categoria
- [x] CRM com pipeline de status (prospect → actif)
- [x] Dossier de cliente reorganizado com KPI strip + 3 colunas
- [x] Timeline de atividade por cliente
- [x] Exportação Excel de prospects
- [x] Adicionar prospect direto ao CRM
- [x] Design system: papel/tinta/terracota, Barlow Condensed
- [x] Briefing digital — formulário por link (/briefing/[token])
- [x] Diagnóstico cliente — PDF de venda com copy gerado por IA
- [x] Devis & propositions — editor + PDF profissional com presets de serviços
- [x] Checklist mensal recorrente por cliente

---

## Roadmap — Gestão de clientes

### 🔴 Alta prioridade

#### Faturamento e pagamentos
- Geração de fatura mensal por cliente ativo (PDF)
- Controle de status de pagamento: pago / pendente / atrasado
- Histórico de faturas por cliente
- Dashboard financeiro: MRR, churn, receita prevista

#### Calendário de conteúdo *(adiado — usar Notion por ora)*
- Calendário mensal por cliente (publicações programadas)
- Campos: plataforma (Instagram/Facebook/GMB), tipo de post, data, status

### 🟡 Média prioridade

#### [x] Proposta comercial / Devis — IMPLEMENTADO
#### [x] Checklist mensal recorrente — IMPLEMENTADO
#### [x] Briefing de cliente (formulário por link) — IMPLEMENTADO

#### Briefing — melhorias futuras
- Upload de assets (logo, fotos)
- Notas de onboarding
- Visualização das respostas no dossier (atualmente só salva no DB)

### 🟢 Baixa prioridade / Futuro

#### Relatório mensal para o cliente
- Template de relatório com KPIs (alcance, cliques, avaliações Google)
- Exportação PDF ou link compartilhável
- Histórico de relatórios por cliente

#### Alertas de retenção
- Contrato expirando em 30/60 dias
- Cliente sem atividade registrada há X dias
- Queda de performance detectada

#### Portal do cliente (fase avançada)
- Área autenticada para o cliente ver relatórios
- Aprovação de conteúdo antes de publicar
- Chat/comentários por post ou campanha

---

## Roadmap — Site público (studioquartier.fr)

- [x] Landing page básica (em construção)
- [ ] Página de serviços detalhada
- [ ] Página de casos de sucesso / clientes
- [ ] Blog / artigos sobre marketing local em Paris
- [ ] Formulário de contato com CRM integrado (novo prospect entra direto no pipeline)
- [ ] Versão mobile otimizada

---

## Integrações futuras

- **Google Business Profile API** — publicar posts diretamente do calendário
- **Instagram Graph API** — agendar publicações
- **Stripe** — pagamento de faturas online
- **Brevo (ex-Sendinblue)** — automação SMS + email para clientes dos clientes
- **Notion / Google Docs** — sync de briefings
- **Zapier / Make** — automações (ex: novo cliente assina → cria checklist)

---

## Notas técnicas

- Stack: Next.js 16, Supabase (projeto `euqlzbzfvljgkdrcgpzd`), Vercel Hobby
- Design system: `src/lib/sq-design.ts`
- i18n: PT + FR via `src/lib/i18n/`
- Domínio público futuro: `studioquartier.fr` (registrado na OVH)
- Domínio interno atual: `sq.andregutto.com/tools`
