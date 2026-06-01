# Studio Quartier — Roadmap de Desenvolvimento

## Ferramentas internas (já construídas)

- [x] Prospecção com Google Places API + análise IA por arrondissement
- [x] Histórico de buscas com tabela + mapa
- [x] CRM com pipeline de status (prospect → actif)
- [x] Dossier de cliente com timeline de atividade
- [x] Exportação Excel de prospects
- [x] Adicionar prospect direto ao CRM
- [x] Design system: papel/tinta/terracota, Barlow Condensed

---

## Roadmap — Gestão de clientes

### 🔴 Alta prioridade

#### Faturamento e pagamentos
- Geração de fatura mensal por cliente ativo (PDF)
- Controle de status de pagamento: pago / pendente / atrasado
- Histórico de faturas por cliente
- Dashboard financeiro: MRR, churn, receita prevista

#### Calendário de conteúdo
- Calendário mensal por cliente (publicações programadas)
- Campos: plataforma (Instagram/Facebook/GMB), tipo de post, data, status
- Vista semanal e mensal
- Checklist de aprovação do cliente

### 🟡 Média prioridade

#### Proposta comercial / Devis
- Criação de proposta com pacotes de serviço e preços
- Exportação em PDF com branding Studio Quartier
- Histórico de propostas por cliente
- Aceito / recusado / em negociação

#### Checklist mensal recorrente
- Tarefas padrão que se repetem a cada mês por cliente
- Indicador de progresso por cliente no mês corrente
- Alertas de tarefas atrasadas

#### Briefing de cliente
- Ficha com: tom de voz, referências visuais, concorrentes, objetivos
- Upload de assets (logo, fotos)
- Notas de onboarding

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
- **Notion / Google Docs** — sync de briefings
- **Zapier / Make** — automações (ex: novo cliente assina → cria checklist)

---

## Notas técnicas

- Stack: Next.js 16, Supabase (projeto `euqlzbzfvljgkdrcgpzd`), Vercel Hobby
- Design system: `src/lib/sq-design.ts`
- i18n: PT + FR via `src/lib/i18n/`
- Domínio público futuro: `studioquartier.fr` (registrado na OVH)
- Domínio interno atual: `sq.andregutto.com/tools`
