# Arvo — Direção de Arte & Plano de Elevação Premium (v3)

> **Para o executor (Sonnet):** análise independente do produto **rodando** — landing,
> login e **todas as páginas autenticadas** foram inspecionadas ao vivo (desktop
> 1366×980 / ~800px md / mobile 375×812) usando uma cópia isolada do frontend com
> auth e API mockadas (ver §6 — o harness está pronto para você reutilizar).
> O briefing de 2026 entra só como essência da marca; o produto evoluiu além dele
> por decisões conscientes. **A identidade de IA (pássaro tricolor + aurora) é
> assinatura da marca e fica** (§3.7). Execute fase por fase; verifique conforme §6.

**Objetivo:** Arvo com cara de ferramenta premium de finanças desenhada pela melhor
agência do mundo — preto + dourado + off-white quente, serif editorial, acentos dos
pássaros brasileiros, "quiet confidence".

---

## 1. Veredicto

**O produto real é melhor que os mockups da landing.** O app autenticado já tem:
lockup "arvo | CAPITAL" no header, card de patrimônio creme com brilho dourado
(genuinamente bonito), toques de Playfair itálico ("*onde seu patrimônio está
plantado*"), tabelas com valores à direita, footer institucional limpo, metáfora
de níveis Semente→Crescimento→Expansão (conceito perfeito para a marca). A fundação
é forte.

**O que separa o estado atual de "premium de agência" são 7 padrões repetidos:**

1. **Banners de alerta amarelo/laranja** empilhados no topo (lembrete de orçamento +
   prompt "abrir em Finanças" + avisos "92% do orçamento") — no mobile os dois
   primeiros consomem **a primeira tela inteira** antes de qualquer dado. É o maior
   destruidor de primeira impressão do app.
2. **Cores fora da paleta** espalhadas: pill "Rendimento" roxa, valores "Plus-values"
   roxos, benchmarks IBOV roxo/S&P laranja, links "Limpar tudo/Restaurar" azul
   genérico, avatares de instituição teal/índigo aleatórios, cards de Momentos em
   pastéis (azul-bebê/rosa), medalhas 3D laranja/azul brilhante. Cada um é pequeno;
   juntos, diluem a identidade preto+dourado.
3. **Emoji como iconografia de dados** (classes 📊🏢💎, notificações 🏆💰🔄, categorias
   🛒🏠, banners 📋, pills "✅ No planejado", níveis 🌿🚀) — rende diferente por OS e
   lê consumer; num produto de patrimônio, ícones desenhados valem ouro.
4. **Chip-soup nos controles**: na linha do título do Dashboard há 7 controles do
   mesmo peso visual (5 chips de período + Atualizar + COMPARTILHAR); no mobile
   quebram em 2 linhas. Falta hierarquia: um segmented control + ações separadas.
5. **Gráficos com cara de default Recharts**: eixos/grades/tooltips/legendas padrão,
   barras finas espaçadas, stacked bars arco-íris no histórico de categorias.
6. **Tipografia de dados sem disciplina**: nenhum `tabular-nums` no app, título de
   página em DM Sans simples sem eyebrow, label "GANHO NO PERÍODO · YTD" quebrando
   em 2 linhas no card-herói.
7. **Login quebrado em desktop** (painel pequeno flutuando em vazio preto) — primeira
   tela após o CTA da landing.

---

## 2. Achados por superfície (evidência: telas ao vivo)

### 2.1 Landing (detalhado)

Forte (não mexer na essência): hero (foto + serif + itálico dourado + 2 mockups),
quebras fotográficas, quote filosófica, "três etapas" com números editoriais.

1. **Header**: hoje barra branca 96% opaca colada sobre o hero preto — corta a
   imersão na entrada. → Sobre o hero, header **transparente** (logo na variante
   clara `arvo-symbol-gold`/`offwhite`, links off-white); ao cruzar ~80% do hero
   (IntersectionObserver já existe na página), transiciona em 280ms para fundo
   `rgba(250,248,244,0.85)` + `backdrop-blur(12px)` + logo preto. O header nunca
   some — só muda de pele. No mobile, mesmo comportamento.
2. **CTAs**: mostarda `#C9911A` → sistema §3.2. No hero (fundo escuro): dourado
   `#C8B89A` com **texto preto** (ver justificativa do "apagado" em §3.2). Ghost
   "já tenho conta" mantém.
3. **Funcionalidades** (maior oportunidade): gaps de seção `clamp(96px,10vw,140px)`;
   cada mockup ganha palco (tile bege `#F1EDE5` radius 18 + sombra
   `0 24px 60px -20px rgba(13,13,13,0.25)`); grid 12 col (texto 5 / palco 6 / 1
   respiro), phone ~360px; re-orquestrar: f1 Portfólio e f4 Liberdade como
   features-hero full-width, f2/f3/f6 como faixa de 3 cards verticais sobre fundo
   bege de sangria total, f5 IA com o pássaro-aurora protagonista; remover borda
   superior colorida dos frames (acento entra como eyebrow+dot); glifos `✈︎ ⌂` →
   ícones stroke; barra com gradiente `#4B7BF0` → azul sólido.
4. **Stats bar**: padding vertical ~56px, hairlines verticais entre células,
   reveal com stagger (delays `arvo-reveal-d*` já existem).
5. **Mockups**: i18n completo (hoje mostram "Liberdade Financeira"/"Mês/YTD" em PT
   com página em FR); Dynamic Island ~64×18 e bezel 8-10px no iPhone, 10-12px no
   MacBook; donut sem segmento preto puro (cripto `#5A5248`); tickers sem bold 600.
6. **FAQ**: numeração `01–06` serif apagada à esquerda; animação de altura 280ms.
7. **Footer**: editorial em 2 linhas — wordmark + *cultive o que é seu* em Playfair
   itálico dourado à esquerda, colunas Produto/Legal/Idioma à direita; linha 2 com
   © e social; hairline dourada 12% no topo.
8. **Seletor de idioma**: bandeirinhas emoji → `PT · EN · FR` tipográfico
   (`LanguageSelector.tsx`, vale para landing, login e app).
9. **Mobile**: eyebrow e parágrafo curtos via i18n; mockup phone estático leve
   abaixo dos CTAs (imagem otimizada, não DOM).
10. **Hero motion**: ken-burns sutil na foto (scale 1.0→1.05, 20s).
11. **OG/Twitter tags** + `public/brand/og-cover.jpg` 1200×630 (preto, símbolo
    dourado, tagline).
12. Erro/sucesso do login dropdown: `#dc2626`/`#166534` → `--arvo-red`/`--arvo-green`.

### 2.2 Login

Confirmado em 1440×900: o painel do formulário renderiza pequeno no topo, ~70% da
tela vira vazio preto. Reconstruir como split editorial (foto Tier-1 45% com tagline
Playfair itálico / coluna de formulário centrada verticalmente, `min-height: 100dvh`,
max-width 400px). Inputs outlined radius 3 com foco dourado (já existe o foco).

### 2.3 App — shell (visto em todas as páginas)

- **Header**: lockup + pills de seção + sino + avatar — bom. Refinos: badge do sino
  e estados hover 160ms; avatar com anel hairline dourado.
- **Sub-nav**: ativo = caixinha com dot (fussy). → underline 2px deslizante, mais
  editorial. Label "Balanc." abreviado → "Balanço".
- **Banners**: padrão único novo — faixa fina (1 linha) fundo bege `#F1EDE5`,
  hairline esquerda dourada 2px, texto curto, ação como link, no **máximo um**
  visível por vez (fila). No mobile, 56px no total. Sem emoji 📋, sem amarelo, sem
  botão laranja sólido.
- **Mobile bottom**: pill de sub-nav flutuante + tab bar empilhados comem ~150px e a
  pill sobrepõe conteúdo de card. → integrar: tab bar fixa embaixo; sub-nav vira
  scroll horizontal de texto simples colado sob o header (padrão app de banco), não
  flutuante sobre o conteúdo.
- **↳ Correção pós-Fase 2 (feedback de uso real)**: docar o sub-nav no topo resolveu
  a sobreposição, mas tirou o controle mais usado por sessão da zona do polegar —
  em telas altas o topo exige duas mãos, e o sub-nav é trocado o tempo todo (o
  switcher de 3 seções principais, não). → reverter posição sem reintroduzir o bug:
  sub-nav volta para baixo, mas como **segunda linha dentro da MESMA barra flutuante**
  do tab bar principal (uma pill só, ~24px radius em vez de stadium puro, divisor
  hairline entre as duas linhas) — mantém o estilo underline/scroll horizontal
  (esse refinamento foi um ganho real, não é o que está sendo revertido) e o
  critério "1 barra flutuante só" da Fase 2, agora no alcance do polegar. Remover o
  bloco de sub-nav docado sob o header no mobile. Ajustar `.main-content
  padding-bottom` (index.css) e `.chat-bubble-safe`/`.chat-dialog-safe` para a
  nova altura da barra.
- **Gamificação no chrome**: XP/nível saem do header → Perfil/Conquistas.

### 2.4 App — página por página (visto ao vivo)

**Dashboard**
- Card-herói creme: manter o efeito; reduzir para 1 glow; número 40-44px
  `tabular-nums`; encurtar labels dos KPIs (ex.: "GANHO · YTD") para nunca quebrar
  linha; timestamp discreto.
- Linha de controles: segmented control único (Mês/30d/12m/YTD/Início) radius 3 +
  ícone refresh + botão Compartilhar fantasma — 3 elementos, não 7.
- "Destaques do período": remover borda dos itens (caixa-dentro-de-caixa) → linhas
  com hairline e hover bege; pct verde via `StatDelta`.
- Donut alocação: rótulos dispersos em ângulos → legenda em coluna à direita com
  dot+nome+%+valor alinhados; segmento Cripto preto puro → `#5A5248`.
- Dividendos: ok; eixo do mini-gráfico com meses legíveis.
- Índices de mercado: deltas alinhados; CDI "—" com tooltip explicando.

**Performance**
- 4 KPI boxes → faixa única com 4 colunas separadas por hairline (menos caixas).
- Benchmarks: IBOV roxo e S&P laranja → paleta fixa de série: Carteira preto,
  CDI dourado `#C8B89A`, IBOV azul arara, S&P500 terracota `#A36A52`. Toggles de
  série como chips finos com dot da cor.
- Gráfico: kit Arvo (§3.5) — tooltip escuro, grid 5%, eixos DM Sans 10px, linha da
  carteira 2px preto, benchmarks 1.5px.
- Tabela mensal: já alinha à direita (bom); header "DIVIDENDOS" verde → neutro;
  `tabular-nums`; hover bege.

**Análise (Diversificação)**
- Largura do conteúdo difere das outras páginas → padronizar container.
- Veredicto "Concentrada" vermelho gigante → eyebrow + palavra em Tenor Sans com
  dot de severidade (vermelho só no dot/score); HHI com barra fina.
- Acordeão "ℹ️ Índice HHI" azul-bebê → bloco bege com hairline dourada, ícone stroke.
- Bandeiras emoji 🇧🇷🇺🇸 nas linhas → ok manter bandeiras? Não — círculos com código
  ("BR", "US") em hairline, consistente com InstitutionLogo novo (§2.4-Instituições).

**Ativos**
- Tabela agrupada boa. Grupo: faixa bege de banda + ícone de classe desenhado
  (substitui 📊🏢); ticker com hierarquia por tamanho/cor (não bold 600); coluna
  PREÇO com "PM:" em linha secundária ok; `tabular-nums` geral; hover de linha.
- "CLASSES →" vira ghost button padrão.

**Aportes**
- Pill "Rendimento" roxa → dourado-texto `#8C6A28` em tint dourado; "Compra"/"Venda"
  pills neutras (tint bege) — tipo é categoria, não sentimento.
- Ícones editar/excluir só no hover da linha (desktop).

**Renda Passiva (Dividendos)**
- KPI "Total recebido" verde gigante → preto com delta verde menor ao lado (verde é
  para variação, não para todo número positivo).
- Gráfico mensal: barras mais largas (radius 2px no topo), eixo limpo, valor no
  hover via tooltip Arvo.
- Card "Maiores pagadores" com 1 item → mini-ranking de 3 com barras horizontais.

**Balanceamento**
- Vermelho usado para acima E abaixo da meta → neutro na direção ("+3,0% acima" em
  cinza-quente) e cor apenas na ação sugerida; marcador de meta visível na barra
  (tick 2px preto); inputs % alinhados, radius 3.
- "Ações sugeridas": Reduzir/Aportar com seta + valor `tabular-nums`, cores
  vermelho/verde só no valor.

**Índices**
- Labels de categoria "EQUITY/RATE/INFLATION" em inglês no meio de UI pt → i18n.
- Mini-colunas 1m/YTD/12m ambíguas (altura não proporcional) → trocar por três
  `StatDelta` alinhados em grid.
- IPCA verde quando sobe → inflação usa cor neutra (sentimento não se aplica).

**IR (Relatórios)**
- Typo no título: "Relatorios IR" → "Relatórios IR".
- KPI "Plus-values" roxo → token.
- Caixas de instrução azul/amarela/cinza (Bootstrap-alert) → um único padrão: bloco
  bege, hairline esquerda (dourada para info, azul para ação), título pequeno em
  uppercase, corpo 14px. A tabela interna branca fica.
- Stepper "1. Dados / 2. Taxa de câmbio / 3. Prévia" → números editoriais (eco da
  landing) com conector hairline.

**Instituições**
- Avatares com iniciais em teal/índigo/vermelho aleatórios → fundo preto com
  iniciais douradas, ou logo real quando houver; cores aleatórias fora.
- Rows acordeão ok; valores `tabular-nums`.

**Classes**
- Picker de emoji (30 opções) → grade de ~20 ícones desenhados (broto, árvore,
  prédio, banco, globo, moeda, escudo, gráfico…) gravando key nova; legado emoji
  resolvido no render (mapa emoji→key, fallback `◆`).

**Detalhe do Ativo** (`/assets/:id`)
- Durante a revisão a rota derrubou o React com dados mínimos — **verificar
  robustez** (guards de null em history/contributions) além do redesign visual
  (mesmos padrões: PageTitle, kit de gráfico, KPIs em faixa).

**Finanças — Visão Geral**
- Card-herói com split saldo/projeção é boa arquitetura. Refinos: pill "✅ No
  planejado" → dot verde + texto (sem emoji); projeção estourada: vermelho no número
  e na fração excedente da barra, não em 3 elementos; formato "R$ 40,6 mil"
  consistente (definir regra: compacto só acima de 100 mil?).
- O aviso "92% do orçamento" vira o banner-padrão único (§2.3), não terceira faixa.
- "Renda recebida" com barra dourada: ótimo, manter como assinatura da página.
- "Gastos vs Planejado"/"Top categorias": ícones desenhados, barras na cor do
  envelope, valores à direita `tabular-nums`.
- Históricos: stacked bars arco-íris → paleta de envelopes limitada (azul, dourado,
  terracota, verde-folha) com `stackOffset` limpo; legendas custom; filtros de
  categoria sem emoji dentro de pills.

**Finanças — Transações**
- Mar de vermelho: TODA despesa em vermelho → valores de despesa em preto
  (`tabular-nums`, sinal −), verde só para receitas, vermelho reservado a alertas.
  É a mudança nº 1 de maturidade visual da vertical.
- Pills de categoria com emoji → dot colorido + nome.
- "Junho De 2026" → "junho de 2026" (capitalização do mês).
- Checkboxes visíveis sempre → aparecem no hover/seleção.
- KPI Despesas/Receitas: mesmos princípios (preto/verde).

**Finanças — Planejamento (Budget)**
- **Bug HTML real**: `<button>` aninhado em `<button>` no EnvelopeBar (erros de
  hidratação no console) — corrigir na refatoração.
- Big % colorido por envelope (50.0% azul parece link) → número preto + barra na
  cor do envelope.
- Aviso amarelo "€ 788 sem categoria" → banner-padrão.
- Linhas de categoria: ícone desenhado, "média 3m" como tooltip ou coluna discreta.

**Finanças — Momentos**
- Cards com banda pastel (azul-bebê ✈️, rosa 💒) → trocar por: foto de capa com
  Arvo Preset (a marca tem biblioteca) ou banda bege com glifo/ícone stroke grande
  na cor do acento; paleta de momento limitada aos tons da marca (azul arara,
  terracota, ocre, verde, dourado).
- É a feature mais "vida" do produto — merece o tratamento fotográfico que a landing
  já usa.

**Finanças — Liberdade**
- A página-sonho do produto é a mais default hoje. Tratamento assinatura:
  ano-alvo em Tenor Sans grande (eco do mockup "2041" da landing), KPIs em faixa
  com hairline, gráfico de trajetória com área azul 15%→0 + linha de meta dourada
  pontilhada + marco "FIRE" com dot dourado, card amarelo "Previsto para hoje" →
  bege; aviso "Atrasado em relação ao plano" → banner-padrão.
- Eixo "100.000.000 tri" → formatação compacta inteligente (R$ 1,2M).

**Finanças — Insights**
- Estrutura boa (tabs, KPIs, rows com ação "não é assinatura"). Refinos: pill
  "Mensal" tint dourado; valores `tabular-nums`; ícone da assinatura desenhado.

**Notificações**
- Emojis → ícones stroke com dot de severidade; links "Limpar tudo/Restaurar" em
  azul genérico → azul arara ou dourado-texto; timestamps apagados.

**Perfil**
- Inputs cinza-preenchidos aqui vs outlined no login → um único estilo global:
  outlined, radius 3, foco dourado.
- Card de nível: manter a metáfora (é ótima), trocar 🌿/🌳 por ícones desenhados
  broto/árvore; barra preto→dourado fica (bonita).
- Segmented Perfil/Preferências/Avançado → radius 3 com underline, consistente com
  sub-nav.

**Conquistas**
- Medalhas 3D brilhantes (laranja/azul glossy) → selos circulares de linha: anel
  stroke 1.5 dourado + glifo interno + data; earned = dourado pleno sobre bege;
  locked = hairline `--arvo-fg-faint` com cadeado discreto (sem ghost cinza 3D).
- Nível "Liberdade" com 🚀 → glifo de árvore plena/horizonte (jardim, não foguete).
- Tabs de nível com emoji → ícones da progressão broto→árvore.

**ChatWidget (assinatura IA)** — ver §3.7.

### 2.5 Dark mode (inspecionado ao vivo com `arvo_theme=dark`)

O dark mode **já existe e já é bonito** — é dirigido por tokens (`.dark` em
`colors_and_type.css:184` troca as variáveis `--arvo-*`), então tudo que usa
variável flipa automaticamente: fundo preto, cards `#161513` quentes, eyebrows
dourados, header com pill clara. O dashboard escuro já parece "private bank".
Furos encontrados (todos pontuais):

- **Banner amarelo continua claro** no escuro (cores hardcoded) — gritante. O
  Banner-padrão da Fase 2 resolve por usar tokens.
- **Azul arara `#1B4FD8` vibra sobre preto** (rótulo "Ações Brasil" do donut quase
  ilegível). → criar token `--arvo-blue-on-dark: #7FA3F0` (paralelo ao
  `--arvo-green-on-dark` que já existe) e usar em todo texto/dado azul no escuro.
- **Vermelho `#D63B2F` vira neon** na tabela de transações escura. → token
  `--arvo-red-on-dark: #E8867C`. (A mudança "despesas em preto" da D5 vira
  "despesas em `--arvo-fg`" — funciona nos dois modos.)
- **Checkboxes brancos berrantes** nas transações escuras → estilizar com
  `accent-color` / borda token.
- **Landing e login não têm dark** (cores literais) — **decisão de design, não
  bug**: marketing é sempre preto-sobre-foto e produto-claro por padrão. Manter.

**Consequência para a execução (revisão da D4):** dark mode deixa de ser "adiado"
e vira **disciplina transversal + fase curta**: (a) em toda fase, qualquer cor
nova entra via token — nunca literal — para o dark continuar flipando sozinho;
(b) Fase 8.5 — Dark polish (½ dia): criar os dois tokens on-dark, varrer banner/
checkbox/casos hardcoded, screenshot dark de Dashboard, Transações, Conquistas e
chat aberto.

---

## 3. Sistema visual (vocabulário único)

### 3.1 Tipografia e números
- Títulos/display: **Tenor Sans**; editorial: **Playfair itálico** (dourado);
  corpo/dados: DM Sans.
- `PageTitle` global: eyebrow uppercase 10px/0.30em apagado ("CAPITAL ·
  INVESTIMENTOS", "CAPITAL · FINANÇAS") + título Tenor 22-26px. Substitui todos os
  títulos DM Sans planos.
- `.arvo-num { font-variant-numeric: tabular-nums }` em TODO número financeiro;
  colunas numéricas à direita.
- Regra de formato compacto: valores ≥ R$ 100.000 podem usar "mil/M"; abaixo,
  número pleno.

### 3.2 Botões e controles
- Primário claro: preto/texto branco, radius 3, uppercase 0.16em, hover `#2A2620`.
- Primário escuro: dourado `#C8B89A`/texto preto. Secundário: ghost hairline.
  Link: uppercase com hover→dourado. **Some o laranja `#D97706` e o mostarda
  `#C9911A`.**
- **Contexto do mostarda (decisão consciente do André, não erro):** o CTA dourado
  do briefing parecia *apagado*, então a cor foi esquentada para `#C9911A`. O
  diagnóstico correto é outro: dourado claro + **texto branco** = contraste ~1.9:1,
  por isso lavava. Com **texto preto** sobre `#C8B89A` o contraste vai a ~12:1 e o
  botão ganha presença sem sair da paleta. Se após implementar ainda faltar punch
  no hero, o ajuste autorizado é **aumentar o botão** (padding 18px/40px, tracking
  0.18em) e/ou usar o glow dourado da página atrás dele — nunca inventar um terceiro
  tom de amarelo.
- **Resposta ao "site apagado" (princípio geral):** a sensação de apagado vinha de
  contraste raso, não de falta de matizes — e a cura por adição de cores (roxo,
  teal, mostarda, pastéis) diluiu a identidade. As alavancas de vibração deste
  plano: números-herói maiores em Tenor, fotografia em sangria total, dourado
  estrutural (hairlines, barras de progresso, glow único), azul arara usado com
  confiança nos dados/ações, seções escuras alternando com claras na landing, e
  fundo quente `#FAF8F4` que faz o preto e o dourado renderem mais. Mais contraste
  com menos cores.
- Segmented control único (radius 3, borda hairline, ativo preto) substitui chip-soup
  de períodos em Dashboard/Performance/Assets/Dividends/Transações.
- Inputs: um só estilo global — outlined, radius 3, foco borda dourada.

### 3.3 Cor
- Superfícies: app `#FAF8F4`, cards `#FFFFFF`, afundado/hover `#F1EDE5`.
- Acento de produto: **azul arara** para ação/dado/tag. Dourado = constante da marca.
- Sentimento: verde/vermelho **apenas em variações com sinal e alertas** — despesas
  em preto, totais positivos em preto.
- Séries de gráfico: preto, dourado, azul arara, terracota, ocre, verde-folha;
  cripto em charts `#5A5248`. **Proibidos:** roxo, teal, índigo, rosa, pastéis,
  azul-link genérico, amarelo-alerta.
- Banner-padrão: bege + hairline esquerda dourada (info) ou vermelho guará (alerta),
  máx. 1 visível.

### 3.4 Cards e profundidade
- Card: radius 14, hairline, sem sombra (md no hover se interativo). Modal: radius
  16 + sombra lg + overlay `rgba(13,13,13,0.55)`.
- Sem caixa-dentro-de-caixa: listas internas usam hairlines, não bordas próprias.
- 1 glow dourado por tela (card-herói no dashboard; pássaro na landing).

### 3.5 Kit de gráficos (`components/charts/`)
- `ArvoTooltip` (fundo `#161513`, off-white, radius 10, hairline dourada 15%),
  defaults de eixo/grid (DM Sans 10px apagado, grid `rgba(13,13,13,0.05)`), legendas
  custom (dot + label), barras com radius 2 topo, áreas 15%→0.
- Formatador de eixo compacto (R$ 1,2M; nunca "100.000.000 tri").

### 3.6 Grid, larguras e telas grandes (≥1536px) — inspecionado em 1920×1080

Hoje o `main` usa `max-w-6xl` (1152px) e salta para `max-w-[1600px]` no breakpoint
`2xl` (`AppLayout.tsx:545,549`) **mantendo a mesma estrutura de 2 colunas** — em
1920px os cards esticam sem densificar: card-herói com 4 KPIs espalhados e vazio
no meio, donut de ~240px boiando num card de ~1050px, gráfico de Performance
virando fita de ~1600×230 (proporção ~7:1; líderes usam 2.5–3.5:1), tabela mensal
com ~700px de ar entre a coluna MÊS e os valores. Em ≤1440px a estrutura atual
(hero + trilho direito) é equivalente à dos líderes (Copilot/Monarch centram em
~1200; Kubera densifica quando estica) — o problema é só o regime `2xl`.

Especificação:

1. **Container**: trocar `2xl:max-w-[1600px]` por **`2xl:max-w-[1440px]`** com
   `2xl:px-8`. (1440 de conteúdo em 1920 deixa margens de ~240px — proporção de
   leitura confortável; 1600 só faria sentido com 3+ colunas reais.)
2. **Dashboard em `2xl`** — bento de 12 colunas, 3 colunas reais em vez de 2:
   - Linha 1: ValueCards `col-span-8` + Índices `col-span-4`. Dentro do
     ValueCards, KPIs em **4 colunas iguais separadas por hairline** (nunca
     flutuando nos cantos); número-herói à esquerda, mas o bloco de KPIs ocupa a
     largura toda.
   - Linha 2: Alocação `col-span-5` (donut escala com o card, mín. 280px, legenda
     em coluna à direita do donut) + Destaques `col-span-4` + **Dividendos
     `col-span-3` em formato vertical** (sobe da faixa de rodapé para a grade).
3. **Performance em `2xl`**:
   - KPIs: a faixa única de 4 colunas com hairline (já prevista) escala bem — sem
     mudança extra.
   - **Gráfico: altura responsiva `clamp(300px, 24vw, 420px)`** em vez de fixa.
     É a correção nº 1 de tela grande: acaba com a fita.
   - Tabela mensal: máx. `~1100px` centrada dentro do card **ou** ganhar colunas
     extras quando larga (Δ vs CDI, drawdown) — nunca esticar 6 colunas em 1600px.
4. **Tabelas em geral (Ativos, Transações, Aportes)**: em `2xl`, limitar a área de
   texto corrido e usar o espaço extra para colunas de dados (preço médio, peso %,
   variação dia), não para gaps maiores.
5. **Gráficos de barra/área**: margens e ticks escalam com o container; barras com
   `maxBarSize` para não engordar em telas largas.

### 3.7 Assinatura IA — "Aurora" (fica e vira sistema)
- Pássaro tricolor + aurora cônica girando = identidade da IA, único lugar onde as
  três cores convivem. Refinos premium: rotação 2.8s → **7s**, blur 14-16px, opacity
  ~0.5, estática sob `prefers-reduced-motion`.
- Estender: dots de "digitando" do chat (hoje `gray-400` com bounce) → 3 dots nas
  cores dos pássaros com fade sequencial; anel aurora 1.5px no avatar das respostas;
  hover do enviar.
- A aurora NÃO entra em chrome, cards de dados ou botões comuns — escassez é o valor.

### 3.8 Ícones (`components/icons.tsx` + `lib/classIcons.ts`)
- Set único stroke 1.5/16px `currentColor`: consolidar os do AppLayout + criar
  ~25 (selo, banco, alerta, carteira, moeda, escudo, globo, prédio, casa, relógio,
  repetir, broto, árvore, trigo, montanha, pizza, linha, alvo, chave, engrenagem,
  arquivo, check, x, tesoura, avião, anel).
- `classIcons.ts`: registro key→Icon para classes/categorias/momentos; legado emoji
  resolvido no render; novos salvamentos gravam key.
- Únicos glifos permitidos como texto: `⬡ ◈ ◎ ✦ ●`.

---

## 4. Fases de execução

> Tudo camada de apresentação. Exceções de lógica permitidas: `lib/notifications.ts`,
> novo `lib/classIcons.ts`, correção do botão aninhado no BudgetPage e guards do
> AssetDetailPage.

**Fase 0 — Fundações (½ dia)** — **[CONCLUÍDA]** tokens quentes (`#FAF8F4`/`#F1EDE5`), `.arvo-num`,
`:focus-visible` dourado, `prefers-reduced-motion`, radius canônicos, primitivos
`ui/` (Button, Card, Eyebrow, PageTitle, SectionHeading, EmptyState, StatDelta,
Modal, Banner, Segmented), `icons.tsx`. ✓ build + app igual com fundo aquecido.

**Fase 1 — Login (½ dia)** — **[CONCLUÍDA]** split editorial (§2.2); seletor de idioma tipográfico
global; estilo único de input. ✓ screenshots 1440/390 sem vazio morto.

**Fase 2 — Shell do app (1 dia)** — **[CONCLUÍDA]** Banner-padrão com fila (substitui todos os
amarelos); sub-nav underline; mobile bottom integrado (§2.3); XP fora do header;
notificações com ícones; hover/press 160ms. ✓ máx 1 banner; mobile com 1 barra
flutuante só.

**Fase 2.1 — Correção: sub-nav mobile de volta ao polegar (1-2h)** — ver §2.3
"↳ Correção pós-Fase 2". Unificar sub-nav + tab bar principal numa única barra
flutuante de duas linhas (linha 1 = sub-nav scroll horizontal com underline,
linha 2 = 3 ícones de seção), divisor hairline entre linhas, radius ~24px.
Remover o bloco de sub-nav docado sob o header no mobile (o desktop, centrado sob
o header, fica como está). Ajustar `.main-content padding-bottom` e
`.chat-bubble-safe`/`.chat-dialog-safe` em `index.css` para a nova altura. ✓ sub-nav
no alcance do polegar; ainda 1 barra flutuante só; sem sobreposição de conteúdo;
páginas sem sub-nav (Instituições, Perfil etc.) mostram só a linha de 3 ícones.

**Fase 3 — Landing (2-3 dias)** — **[CONCLUÍDA]** itens §2.1. ✓ 9 seções em 1440/390; um glow; zero
hex fora de token; OG tags.

**Fase 4 — Dashboard + kit de gráficos (1 dia)** — **[CONCLUÍDA]** §2.4-Dashboard + §3.5 + bento 2xl da §3.6; aplicar
Segmented; ValueCards refinado. ✓ screenshot completo desktop+mobile.

**Fase 5 — Páginas core Patrimônio (2 dias)** — **[EM ANDAMENTO]** Performance, Análise, Ativos,
Aportes, Renda Passiva, Balanceamento, Índices, IR, Instituições, Classes (+
classIcons), AssetDetail (guards + redesign), ImportB3, Favorites, Archived —
conforme §2.4. ✓ gate §6 por página.
  - Concluído: Performance, Análise, Ativos, Aportes, Renda Passiva, Balanceamento, Índices.
  - Pendente: IR, Instituições, Classes, AssetDetail, ImportB3/Favorites/Archived, Verificação final (§6).

**Fase 6 — Finanças (2 dias)** — Visão Geral, Transações (despesas em preto!),
Planejamento (bug button + redesign), Momentos (capas fotográficas), Liberdade
(tratamento assinatura), Insights, Compartilhado — conforme §2.4. ✓ screenshots
Overview/Budget/Freedom/Transações.

**Fase 7 — Assinatura IA (½ dia)** — §3.7 no ChatWidget + seção f5 da landing.
✓ FAB + chat aberto + typing.

**Fase 8 — Gamificação editorial (1 dia)** — selos de linha, níveis broto→árvore
(sem 🚀), celebração fade+hairline, toasts discretos, onboarding/checklist sem
emoji. ✓ earned/locked/celebração.

**Fase 8.5 — Dark polish (½ dia)** — tokens `--arvo-blue-on-dark`/`--arvo-red-on-dark`,
banner/checkbox/hardcodes, screenshots dark (Dashboard, Transações, Conquistas,
chat). ✓ nenhuma cor literal nova no diff das fases anteriores.

**Fase 9 — Públicas + polimento (1 dia)** — PublicPortfolio/PublicMoment como
cartão de visita com CTA "feito com arvo"; AcceptInvite; Privacy/Terms layout de
leitura; skeletons bege; contraste (labels ≤10px ≥ `rgba(13,13,13,0.55)`);
`aria-label` em botões só-ícone; varredura final de emoji/cores. ✓ grep emoji = só
glifos; tab-through sem outline nativo.

---

## 5. Decisões fechadas (não re-perguntar)

- **D1** Aurora IA fica e vira sistema. Nunca remover.
- **D2** Paleta quente `#FAF8F4`/`#F1EDE5`; cards brancos. **Regra crítica de
  aplicação (feedback do André pós-Fase 0):** o bege `#F1EDE5` NUNCA preenche
  inputs, selects ou textareas — campo preenchido de creme lê "formulário anos 90".
  A troca do token `--arvo-surface-2` (antes cinza `#F4F4F4`) mudou silenciosamente
  ~14 páginas que usavam `bg-[var(--arvo-surface-2)]` em campos de formulário
  (`ProfilePage`, `InstitutionsPage`, etc.). Corrigir já: **todo input = branco +
  contorno hairline + radius 3 + foco dourado** (estilo global §3.2). `surface-2`
  fica restrito a: hover de linha, poços/wells, trilhas de progresso, palcos de
  mockup e bandas de agrupamento — superfícies passivas, nunca campos editáveis.
  Se, após a Fase 4 (dashboard completo com hairlines e dourado), o André ainda
  preferir fundo branco puro: fallback aprovado = `--arvo-offwhite: #FFFFFF`
  (uma linha; o calor passa a viver só nos acentos). Julgar com telas prontas,
  não com a Fase 0 isolada.
- **D3** Botões §3.2; morrem `#C9911A`, `#D97706`, roxo, teal, pastéis, azul-link.
- **D4 (revisada)** Dark mode já funciona via tokens e fica: toda cor nova entra
  via variável (nunca literal) e a Fase 8.5 fecha os furos (§2.5). Landing/login
  permanecem sem dark por decisão de design.
- **D5** Despesas em preto; verde/vermelho só variação e alerta.
- **D6** Emojis → ícones desenhados mantendo customização; legado resolvido no
  cliente. Glifos `⬡ ◈ ◎ ✦ ●` permitidos.
- **D7** Gamificação fica com pele editorial; XP sai do header; metáfora
  broto→árvore substitui 🚀.
- **D8** Bandeirinhas → seletor tipográfico.
- **D9** Banner-padrão único com fila; máx 1 visível.
- **D10** Momentos com capa fotográfica/banda bege; paleta de momento = tons da marca.

## 6. Verificação

```bash
cd site/portfolio-tracker/frontend
npx tsc --noEmit && npm run lint && npm run build
```

**Harness visual com login mockado (já montado):** cópia do frontend em
`/tmp/arvo-ui-review` com dois arquivos substituídos — `src/lib/supabase.ts`
(usuário fake com `email_confirmed_at`) e `src/lib/api.ts` (fixtures realistas de
todos os endpoints). Sobe via `.claude/launch.json` → config **`arvo-mock`** (porta
5198; `arvo-frontend` na 5199 roda o código real; o dev do André usa 5174 — não
tocar). Se `/tmp` tiver sido limpo: `rsync -a --exclude node_modules --exclude .git
site/portfolio-tracker/frontend/ /tmp/arvo-ui-review/ && ln -s "$(pwd)/site/portfolio-tracker/frontend/node_modules" /tmp/arvo-ui-review/node_modules`
e copiar os dois mocks **versionados no repo**:
`cp docs/review-harness/supabase.mock.ts /tmp/arvo-ui-review/src/lib/supabase.ts` e
`cp docs/review-harness/api.mock.ts /tmp/arvo-ui-review/src/lib/api.ts`. No preview: setar `localStorage['portfolio-locale']='pt'`,
desregistrar o service worker (`navigator.serviceWorker.getRegistrations()` →
unregister + `caches.delete('arvo-v6')`) e navegar por SPA (pushState+popstate) —
reload total quebra a emulação de viewport. Ao editar arquivos do frontend real,
re-rsync para o harness antes de fotografar.

Gate por tela: screenshots em 1366 **e 1920** (2xl) · zero emoji (exceto glifos) · zero roxo/teal/pastel/amarelo-alerta ·
máx 1 banner · números tabulares à direita · radius 3/14/16/999 · 1 glow · Playfair
só itálico · motion 160/280/650ms · focus dourado.

## 7. O que NÃO fazer

- Não adicionar lib de UI/ícones; não tocar backend/rotas/hooks de dados (exceções
  listadas no topo da §4).
- Não remover aurora, gamificação, customização de classes, barra dourada de renda,
  card creme do dashboard (são acertos).
- Não reescrever copy fora dos pontos indicados (typo "Relatórios", "junho de 2026",
  labels EN dos índices).
- Não usar bounce/spring fora da assinatura IA; nada em loop infinito além dela.
