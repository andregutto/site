import type { TranslationKey } from './fr'

export const pt: Record<TranslationKey, string> = {
  // Brand
  studio: 'studio',
  quartier: 'QUARTIER',
  tagline: 'Marketing Digital · Paris',
  internal_tool: 'Ferramenta interna',

  // Nav links
  nav_hub: '← Início',
  nav_history: 'Histórico ↗',
  nav_new_search: '← Nova pesquisa',
  nav_prospection: '← Prospecção',
  nav_clients: '← Clientes',

  // Section labels
  section_prospection: 'Prospecção · Inteligência comercial',
  section_history: 'Histórico',
  section_clients: 'Clientes · Pipeline comercial',
  section_dossier: 'Dossiê',
  section_contact: 'Contato',
  section_business: 'Estabelecimento',
  section_services: 'Serviços',
  section_ai_analysis: 'Análise inicial de IA',
  section_notes: 'Notas internas',
  section_activity: 'Atividade',

  // Filter labels
  filter_neighborhood: 'Bairro',
  filter_category: 'Categoria',
  filter_radius: 'Raio (m)',

  // Buttons
  btn_search: 'Iniciar pesquisa',
  btn_searching: 'Pesquisando…',
  btn_analyzing: 'Análise em andamento…',
  btn_excel: 'Excel',
  btn_add_crm: 'Adicionar ao CRM',
  btn_adding: 'Adicionando…',
  btn_save: 'Salvar',
  btn_save_notes: 'Salvar',
  btn_delete: 'Excluir',
  btn_dossier: 'Dossiê →',
  btn_close: 'Fechar ↑',
  btn_see: 'Ver →',
  btn_see_clients: 'Ver os clientes →',
  btn_launch_search: 'Iniciar uma pesquisa →',
  btn_add_from_prospect: 'Adicionar via prospecção →',

  // View toggle
  view_list: 'Lista',
  view_map: 'Mapa',

  // Priority
  priority: 'Prioridade',
  priority_high: 'Alta',
  priority_normal: 'Normal',
  priority_low: 'Baixa',

  // Status labels (pipeline)
  status_all: 'Todos',
  status_prospect: 'Prospecto',
  status_en_approche: 'Em abordagem',
  status_rdv: 'Reunião',
  status_devis_envoye: 'Proposta enviada',
  status_negocia: 'Negociação',
  status_gagne: 'Ganho',
  status_actif: 'Cliente ativo',
  status_perdu: 'Perdido',

  // Table headers — prospect
  th_num: 'N°',
  th_score: 'Score',
  th_business: 'Estabelecimento',
  th_rating: 'Nota · Avaliações',
  th_web_ig: 'Site · Instagram',
  th_site_quality: 'Qualidade site',
  th_services: 'Serviços recomendados',
  th_address: 'Endereço',
  th_actions: 'Ações',
  th_maps: 'Maps',

  // Table headers — history
  th_date: 'Data',
  th_neighborhood: 'Bairro',
  th_category: 'Categoria',
  th_radius: 'Raio',
  th_prospects: 'Prospectos',
  th_filtered: 'Filtrados',

  // Table headers — clients
  th_status: 'Status',
  th_contact: 'Contato',
  th_services_active: 'Serviços ativos',
  th_monthly_value: 'Valor/mês',
  th_priority: 'Prioridade',
  th_added_on: 'Adicionado em',

  // Score legend
  score_very_high: 'Prioridade muito alta',
  score_high: 'Alta prioridade',
  score_mid: 'Prioridade média',
  score_low: 'Baixa prioridade',

  // Progress / status
  progress_analyzing: 'Análise em andamento',
  progress_prospects: 'prospecto(s)',
  progress_filtered: 'filtrados',
  progress_ignored: 'ignorado(s) (grandes redes)',
  progress_score_desc: 'score decrescente',
  progress_loading: 'Carregando…',
  progress_loading_prospects: 'Carregando prospectos…',
  progress_analyzing_one: 'Analisando…',
  progress_pending: 'Aguardando',

  // Links / inline
  link_website: 'Site ↗',
  link_instagram: 'Instagram ↗',
  link_maps: 'Maps ↗',
  no_website: 'Sem site',
  no_instagram: 'Sem Instagram',
  reviews_suffix: 'avaliações',

  // Empty states / errors
  empty_results: 'Nenhum resultado para este setor.',
  empty_history: 'Nenhuma pesquisa registrada.',
  empty_prospects_in_run: 'Nenhum prospecto encontrado nesta pesquisa.',
  empty_clients: 'Nenhum cliente nesta categoria.',
  empty_activity: 'Nenhuma atividade registrada.',
  error_label: 'Erro',
  error_analysis_label: 'Erro de análise',
  client_not_found: 'Cliente não encontrado.',
  back: '← Voltar',

  // CRM field labels
  field_contact_name: 'Nome do contato',
  field_contact_role: 'Cargo / Função',
  field_email: 'E-mail',
  field_mobile: 'Celular',
  field_phone: 'Telefone',
  field_score_initial: 'Score inicial de IA',
  field_google_rating: 'Nota Google',
  field_website: 'Site',
  field_instagram: 'Instagram',
  field_google_maps: 'Google Maps',
  field_services_ai: 'Sugeridos pela IA',
  field_services_active: 'Serviços ativos (separados por vírgula)',
  field_monthly_value: 'Valor mensal (€)',

  // Event types
  event_note: 'nota',
  event_call: 'ligação',
  event_email: 'e-mail',
  event_meeting: 'reunião',
  event_proposal: 'proposta',
  event_contract: 'contrato',

  // Event form
  event_placeholder: 'Adicionar nota, resumo de ligação, ata de reunião…',

  // Notes
  notes_placeholder: 'Notas internas sobre este cliente…',
  editable_add: 'Adicionar…',
  editable_edit: 'Editar',

  // MRR
  mrr_label: 'MRR ativo',

  // History section label template
  history_count_singular: 'pesquisa',
  history_count_plural: 'pesquisas',

  // Excel button in history
  excel_download: 'Excel ↓',

  // Delete confirm
  delete_confirm: 'Excluir este cliente? Esta ação é irreversível.',

  // Dashboard
  dash_section: 'Ferramentas internas · Studio Quartier',
  dash_tool_prospection_title: 'Prospecção',
  dash_tool_prospection_desc: 'Analisar e pontuar comércios de bairro com IA',
  dash_tool_history_title: 'Histórico',
  dash_tool_history_desc: 'Consultar e exportar as pesquisas anteriores',
  dash_tool_crm_title: 'CRM Clientes',
  dash_tool_crm_desc: 'Gerenciar o pipeline comercial e acompanhar dossiês',
  dash_coming_soon_title: 'Em desenvolvimento',
  dash_coming_soon_desc: 'Próxima ferramenta da agência',
  dash_access: 'Acessar →',
  dash_stat_prospects: 'prospectos identificados',
  dash_stat_runs: 'pesquisas realizadas',
  dash_stat_clients: 'clientes acompanhados',
  dash_stat_mrr: 'MRR ativo',
}
