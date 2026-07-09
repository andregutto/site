# DESIGN_SYSTEM — Branding e UI do Arvo

Registro vivo das decisões de design tomadas com o André (consolidado em
2026-07-09 durante a construção dos tiers). **Leitura obrigatória antes de
criar qualquer elemento visual novo** (página, modal, card, mockup, e-mail).
Cada regra aqui nasceu de um veto ou aprovação explícita dele — não relaxar
sem nova decisão. Atualize este arquivo quando uma decisão nova for tomada.

## Tipografia

- **Display/wordmark**: Tenor Sans (`--arvo-font-display`). Títulos de página,
  wordmark, eyebrows tracked.
- **Corpo/UI**: DM Sans (`--arvo-font-body`). Todo texto funcional.
- **Acento editorial**: **Fraunces itálico** (`--arvo-font-serif`), self-hosted.
  Substituiu a Playfair Display no site inteiro (2026-07-09: "quase ilegível").
  **Nunca abaixo de 16px** — em 15px ou menos ela perde a razão de existir;
  use 17-18px nos destaques. Nunca reintroduzir Playfair.
- Texto funcional nunca abaixo de 13.5px; listas/benefícios ≥14px.

## Cores e tema

- **Tema padrão pra usuário novo (sem preferência salva): DARK** (decisão
  2026-07-09). Quem escolheu tema no toggle mantém a escolha.
- **Toda superfície segue o tema light/dark** (vars `--arvo-*`). É PROIBIDO
  página/modal/painel "sempre-dark" — veto explícito ("tá horrível, tem que
  se adaptar"). Tratamento escuro fixo só DENTRO de região de foto/arte, com
  texto claro confinado ali (foto é elemento, não tema).
- **Dourado em texto sobre superfície clara: só `--arvo-gold-text`**. O
  `--arvo-gold`/#C8B89A em superfície clara é permitido apenas como borda ou
  fill de pill. Sobre dark, `--arvo-gold` é livre e desejado.
- Cores de acento (`#1B4FD8` arara, `#D63B2F` guará, `#E8A020` ocre,
  `#1F8A5B` verde) significam VERTICAIS (Investimentos/Viagens/Comunidade…),
  nunca tiers ou estados.

## Identidade dos tiers (fonte executável: `frontend/src/components/upgrade/tierMeta.ts`)

- **Glifo arvo com degradê por tier** (mesmo desenho do badge admin, que segue
  chapado #C8B89A e intocável):
  - Plus dark: `#E9DCBC → #C8B89A (45%) → #8C6A28`. Plus em superfície clara
    usa a variante mais escura `#C8B89A → #A8905C → #6E5320` (a clara "lavava").
  - Pro (ambos os temas): `#E0B76A → #6B5D4A (35%) → #453F36 (70%) → #2E2A25` —
    "cartão black" com reflexo de bronze vivo no topo.
  - **GLOW/halo: proibido** (testado 2x e vetado — borra). Presença vem do
    próprio degradê.
  - Hierarquia intencional: Plus brilha mais (é o plano-herói comercial);
    Pro é sóbrio de propósito.
- **Fotos por tier**: SEMPRE das imagens autorais fotorrealistas
  (`/Users/andregutto/Documents/AndreGutto/brand/imagens-autorais/fotorrealista`,
  otimizadas pra `frontend/public/brand/tiers/`), e SEMPRE **só o broto** —
  nenhum elemento adicional (café, objetos) na foto de tier. Free = broto no
  vale (dia), Plus = broto no toco (floresta), Pro = broto na floresta escura
  com feixe de luz.
- **Fotos ficam LIMPAS**: proibido sobrepor círculos, grain, glows ou
  composições decorativas ("poluição"). No máximo um gradiente escuro sutil de
  um lado pra legibilidade.
- **Header**: o lockup do plano é o PRÓPRIO logo adaptado (variante C aprovada):
  glifo do logo ganha o degradê do tier + nome do plano ("plus"/"pro") na mesma
  Tenor Sans, MESMO tracking do wordmark (0.30em), menor (12px) e dourado.
  Nunca duplicar o glifo ao lado do logo. Free = logo puro.

## Copy e conteúdo

- **Travessão (—) é PROIBIDO** em qualquer copy/UI. Reescrever a frase.
  Item ausente em lista usa ✕ fino esmaecido (`--arvo-fg-faint`), nunca "—".
- Linguagem de monetização: sempre **"upgrade"**, nunca "assine"/"vire membro"
  (todo usuário já é membro da comunidade). Sem preços até decisão contrária.
- "Ilimitado" por extenso — nunca o símbolo ∞.
- Ícones: NUNCA emoji como ícone de feature. IA = ícone `sparkle` de
  `frontend/src/components/icons.tsx`. Ícones de traço 1.5 no padrão do header.

## Padrões de componente

- **Modais**: bottom-sheet no mobile (template no CLAUDE.md), SEM scroll
  interno (cabe em 100dvh), conteúdo curado (4-6 benefícios) e não tabelas
  completas; foto autoral do tier na lateral desktop com palco generoso
  (modal ~800px, coluna da foto ~300px — a imagem é protagonista); sem linha/borda branca
  no light (sombra do tema separa); botões reais (min-height 44px).
- **Cards de plano (modelo delta)**: Free mostra o que TEM (✓) e depois o que
  NÃO tem (✕ esmaecido, gera desejo); Plus = "Tudo do Free, e mais:" + só o
  delta ordenado por desejo; Pro = "Tudo do Plus, e mais:". Lista longa
  recolhe com "Ver lista completa".
- **Páginas de bloqueio (GatedEmptyState)**: children da rota NUNCA monta
  bloqueado; card sólido no tema, faixa de foto contida, glifo do tier inteiro
  (nunca cortado), corpo em Fraunces ≥17px dourado. "Avisar quando abrir" na
  página registra o interesse DIRETO (não abre modal). Respiro inferior de
  ~110px pro nav flutuante mobile. No mobile o modal de gate É bottom-sheet
  (exceção deliberada aprovada: paywall é interrupção de fronteira).
- **SVG pequeno**: width/height sempre inteiros (fracionário rasteriza em
  subpixel e o glifo sai borrado). Enquadramento de foto por tier via
  `photoPosition` no TIER_IDENTITY.
- **Hero de página no mobile**: compacto (padding reduzido, H1 com clamp,
  subtítulo longo pode sumir abaixo de sm) — o usuário quer ver o conteúdo.
- **TierBadge/TierGlyph**: sempre passar o tema real (`onDark`), nunca fixo.

## Prompts e alertas pro usuário

- **Não metralhar usuário novo**: nenhum prompt/banner opcional na primeira
  visita. Pacing mínimo (ex. a partir da 3ª visita à seção, ou 7 dias de
  conta) e um por vez.
- **Resposta de preferência persiste no BANCO** (user_metadata/profiles),
  nunca só em localStorage/cookie — limpar o navegador não pode ressuscitar
  pergunta já respondida. "Não" também é resposta e também persiste.

## Processo (como trabalhar com o André)

- **Design novo/mudado: apresentar elemento a elemento e esperar aprovação
  explícita ANTES de commit/push.** Auto-commit vale só pra lógica e fixes
  objetivos. Mostrar sempre nos DOIS temas.
- Referências dele: Finary (pricing/features), Epic/epic.new (modal, gates,
  comunidade fechada). A landing do Arvo é a régua interna de qualidade.
- Screenshots que ele precisa ver: mandar como arquivo/deixar ao vivo no
  dev server dele — descrições não bastam.

## Histórico

- **2026-07-09** — Documento criado consolidando as decisões da construção dos
  tiers (Fraunces, tema adaptativo, identidade de tier, fotos limpas, delta
  cards, sem travessão, lockup C no header, processo de aprovação 1-a-1).
