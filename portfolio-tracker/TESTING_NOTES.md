# Portfolio Tracker - Notas de Teste por Etapa

URL: https://portfolio.andregutto.com  
Última atualização: 2026-05-13

---

## ETAPAS CONCLUÍDAS

---

### Item 3 - Validação de inputs numéricos

**O que foi feito:** Criada função `parseLocaleNum` que aceita formatos pt-BR e en-US (vírgula como decimal, ponto como milhar e vice-versa). Função `inputCls` aplica borda vermelha em campos com erro. Aplicado em `FixedIncomeSetupModal`, `ManualValueModal` e `ContributionsPage`.

**Como testar:**
- Ir em Aportes > Novo aporte > campo Preço ou Valor
- Digitar `1.234,56` (pt-BR) → deve aceitar como 1234,56
- Digitar `1,234.56` (en-US) → deve aceitar como 1234,56
- Digitar `abc` → borda vermelha + mensagem "Formato invalido" ao sair do campo
- Digitar `1.234` (3 dígitos após ponto) → deve tratar como milhar (1234), não decimal
- No modal de Renda Fixa → campo Taxa: digitar `102,5` → deve aceitar

---

### Item 4 - Dashboard agrupamento por classe

**O que foi feito:** `AssetTable` agrupa ativos por classe com cabeçalho colapsável (chevron), ponto colorido, nome da classe, contagem, % e valor total do grupo. Grupos sem classe aparecem como "Sem classe". Busca e ordenação funcionam dentro de cada grupo.

**Como testar:**
- Dashboard → verificar que ativos aparecem agrupados por classe
- Clicar no nome de um grupo → colapsa/expande os ativos do grupo
- Verificar ponto colorido ao lado do nome da classe
- Verificar % e valor total no cabeçalho do grupo
- Usar campo de busca → grupos vazios desaparecem, grupos com match permanecem
- Verificar que a linha de rodapé mostra o total geral do portfólio

---

### Item 5 - Gerenciar classes de ativos

**O que foi feito:** Página `/classes` com CRUD completo. Criação de classes com paleta de 15 cores. Edição inline de nome e cor. Exclusão (bloqueada se classe tem ativos). Card "Ativos por classe" permite mover ativos entre classes com dropdown.

**Como testar:**
- Navegar para Classes (ícone ◈ no menu)
- Criar nova classe: nome + cor → aparece na lista
- Editar nome de uma classe existente → salvar → aparece atualizado no Dashboard
- Tentar excluir uma classe que tem ativos → deve mostrar erro (ex: "Classe em uso por 3 ativo(s)")
- Excluir uma classe sem ativos → deve funcionar
- Na seção "Ativos por classe" → selecionar nova classe para um ativo → mover → verificar no Dashboard

---

### Item 6 - Fluxo de Renda Fixa

**O que foi feito:** `FixedIncomeSetupModal` ganhou seção de portabilidade (troca de custodiante). `ContributionsPage` suporta criar novo ativo de renda fixa com todos os parâmetros, registrar aporte adicional via `/fi-deposit`, e resgates. Endpoint `POST /assets/:id/fi-deposit` incrementa `fi_principal` atomicamente.

**Como testar:**
- Aportes > + Novo aporte > + Ativo > Tipo: Renda fixa
- Preencher: código `CDB-TESTE`, nome, tipo pós CDI, taxa 102,5%, valor R$10.000, data início, vencimento (opcional)
- Criar → ativo aparece na lista de ativos do formulário
- Selecionar o ativo criado → tipo buy → Aporte → informar valor → salvar
- No Dashboard, clicar no ativo RF com `needs_manual=true` → abre FixedIncomeSetupModal
- Na seção de portabilidade: clicar em "Registrar portabilidade" → informar nova instituição + data → confirmar
- Verificar que o custodiante foi atualizado na página de detalhe

---

### Item 7 - Renda Fixa com múltiplos aportes

**O que foi feito:** Cálculo de renda fixa agora é tranche-aware. Cada aporte (buy contribution com `value_brl`) acumula juros a partir de sua própria data, não da `fi_start_date` do ativo. Backend busca contribuições buy de RF e monta `rfTranchesMap` antes de calcular valores.

**Como testar:**
- Ter um ativo RF com 2+ aportes em datas diferentes (ex: CDB BTG id=29)
- Verificar no Dashboard que o valor calculado reflete cada tranche crescendo a partir de sua data
- Comparar com cálculo manual: aporte 1 de R$10k em jan/25 a 102% CDI + aporte 2 de R$5k em mar/25 a 102% CDI → valores acumulados independentes
- Verificar que um ativo RF com apenas 1 aporte continua funcionando normalmente

---

### Item 8 - Migração Manual → Renda Fixa

**O que foi feito:** Endpoint `POST /assets/:id/migrate-to-fi` converte ativo manual em RF. Se já houver buy contributions, usa-as como tranches (sem criar nova). Se não houver, cria contribuição inicial com os valores informados. Botão "Converter para RF" aparece na página de detalhe de ativos manuais.

**Como testar:**
- Abrir a página de detalhe de um ativo manual (ex: CDB C6 id=28)
- Deve aparecer botão "Converter para RF" no canto superior direito
- Clicar → abre `MigrateToFIModal`
- Selecionar tipo (ex: Pós CDI), taxa (ex: 102%), valor principal, data início
- Clicar "Converter para RF" → ativo muda de manual para fixed_income
- Verificar no Dashboard que o valor agora é calculado automaticamente (source: bcb)
- Verificar que o botão "Converter para RF" não aparece mais para o ativo migrado
- Testar com ativo que JÁ tem buy contributions → campos principal/data não aparecem (derivados automaticamente)

---

### Item 9 - Ativos Manuais: Rentabilidade histórica

**O que foi feito:** Página de detalhe de ativos manuais ganhou: (1) alerta âmbar quando o último valor foi registrado há mais de 30 dias (com link "Atualizar"); (2) tabela "Historico de valores" mostrando cada entrada com variação % e R$ em relação à entrada anterior, mais recente no topo.

**Como testar:**
- Abrir detalhe de um ativo manual que tem entradas em `manual_values`
- Verificar tabela "Historico de valores" com colunas: Data, Valor, Variação (%), Diferença (R$)
- A primeira entrada deve mostrar "—" na variação (sem anterior)
- Entradas seguintes devem mostrar +/- em verde/vermelho
- Abrir detalhe de um ativo manual com última entrada há mais de 30 dias → deve aparecer banner âmbar "Valor desatualizado há X dias" com botão "Atualizar"
- Ativo sem nenhum valor → banner "Nenhum valor registrado"
- Ativo com entradas recentes (< 30 dias) → sem banner

---

### Item 10 - Ativos Manuais: Toggle Aporte vs Valorização

**O que foi feito:** `ManualValueModal` (aberto no Dashboard ao clicar em ativo manual com needs_manual) ganhou toggle de duas abas: "Valorizacao" e "Aporte". Valorização = fluxo anterior (atualiza manual_value sem mexer no capital investido). Aporte = registra buy contribution + opcionalmente atualiza o valor de mercado se "Novo valor total" for informado.

**Como testar:**
- No Dashboard, clicar em ativo manual (ícone de atualização ou click direto)
- Modal abre na aba "Valorizacao" (comportamento padrão)
- Preencher data + valor + moeda → Salvar → verifica que só atualizou manual_values (sem nova contribution)
- Clicar na aba "Aporte"
- Preencher data + valor aportado (ex: R$5.000)
- Deixar "Novo valor total" vazio → salvar → verifica que criou buy contribution mas não atualizou manual_value
- Repetir aporte com "Novo valor total" preenchido → verifica que criou contribution E manual_value
- Verificar em Aportes que a contribution tipo "Compra" aparece listada
- Verificar em detalhe do ativo que "Investido" aumentou pelo valor do aporte

---

### Item 13 - Imóvel Físico como ativo manual

**O que foi feito:** ContributionsPage > "Novo ativo" tem novo tipo "Imovel fisico". Campos específicos: código (ex: APTO-PARIS), nome (ex: Apartamento Paris 11e), moeda (BRL/EUR/USD), data de compra, valor de compra, e se moeda != BRL: campo "Equivalente em BRL na data de compra" (obrigatório para calcular custo histórico). Cria ativo manual + manual_value inicial + buy contribution automaticamente.

**Como testar:**
- Aportes > + Novo aporte > + Ativo > Tipo: Imovel fisico
- Preencher: código `APTO-PARIS`, nome `Apartamento Paris 11e`, moeda EUR
- Campo "Equivalente em BRL" deve aparecer (moeda != BRL)
- Preencher data compra, valor €200.000, equivalente R$1.280.000
- Clicar "Registrar imovel"
- Verificar que ativo aparece no Dashboard com valor atual em EUR (convertido para BRL)
- Abrir detalhe → "Investido" deve mostrar R$1.280.000
- "Historico de valores" deve ter a entrada inicial (valor de compra)
- Testar com moeda BRL → campo equivalente não deve aparecer
- Verificar que botão "Converter para RF" aparece (é ativo manual)

---

## PRÓXIMAS ETAPAS (resultados serão adicionados após implementação)

---

### Item 14 - Rendimentos recorrentes (dividendos / income manual)

**O que foi feito:** Novo tipo `income` na tabela contributions (migration 002). ContributionsPage tem 3 botões de tipo: Compra (verde) / Venda (vermelho) / Rendimento (roxo). Rendimento não exige quantidade nem preço unitário, apenas data + valor recebido em BRL + descrição. Página de detalhe do ativo mostra badge roxo "Rendimento" nas contribuições de income e um card "Rendimentos recebidos" quando o total > 0. Investido (invested_brl) NÃO inclui income.

**IMPORTANTE - migration necessária no Supabase antes de testar:**
Execute o arquivo `supabase/migrations/002_income_type.sql` no painel SQL do Supabase:
```sql
ALTER TABLE contributions DROP CONSTRAINT IF EXISTS contributions_type_check;
ALTER TABLE contributions ALTER COLUMN type TYPE VARCHAR(10);
ALTER TABLE contributions ADD CONSTRAINT contributions_type_check
  CHECK (type IN ('buy', 'sell', 'income'));
```

**Como testar:**
- Aportes > Novo aporte > selecionar qualquer ativo > clicar no botão "Rendimento" (roxo)
- Campos de qtd e preço unitário devem sumir
- Preencher: data, valor recebido (ex: R$450,00), descrição (ex: dividendo XPML11)
- Clicar "Registrar rendimento" → salvar
- Verificar no histórico da página de Aportes: badge roxo "Rendimento"
- Abrir detalhe do ativo → contribuição aparece com badge "Rendimento" roxo
- Card "Rendimentos recebidos" deve aparecer com o total acumulado
- Verificar que "Investido" NÃO aumentou com o rendimento (só aumenta com Compra/Aporte)
- Adicionar múltiplos rendimentos → total acumula no card
- FII com dividendos mensais: registrar 3 rendimentos → total correto

---

### Item 15 - Perfil: foto, tooltip, termos

**O que foi feito:** ProfilePage ganhou upload de avatar (canvas resize para JPEG 128x128, base64 em user_metadata). Avatar aparece no header (circulo 28px com foto ou iniciais). Hover overlay "Alterar" ao passar o mouse. Tooltip `title` no circulo mostra nome · email. Secao "Termos de uso" adicionada ao final da pagina. Backend GET /profile retorna `avatar_url`, PATCH /profile aceita `avatar_url`.

**Como testar:**
- Perfil → clicar no circulo de avatar ou link "Adicionar foto" → selecionar imagem → deve aparecer redimensionada como circulo
- Hover no circulo de avatar → deve aparecer overlay "Alterar"
- Salvar → recarregar pagina → foto deve persistir
- Header no topo → deve mostrar circulo com foto (ou iniciais se sem foto) ao lado do nome
- Passar o mouse no circulo do header → tooltip com nome completo
- Scroll ate o fundo da pagina de perfil → secao "Termos de uso" deve aparecer com texto de privacidade e versao

---

### Item 16 - PWA

**O que foi feito:** `public/manifest.json` com nome, cores e icone SVG. `public/sw.js` com cache-first para assets estaticos e network-first para chamadas `/api/*`. `index.html` ganhou `<link rel="manifest">`, `<meta name="theme-color">` e metas Apple. `main.tsx` registra o service worker no evento `load`.

**Como testar:**
- Abrir portfolio.andregutto.com no Chrome → DevTools → Application → Manifest → deve mostrar nome, cores e icone
- DevTools → Application → Service Workers → deve aparecer `sw.js` como ativo
- Chrome no desktop → barra de endereco deve mostrar icone de instalacao (computador com seta)
- Instalar → app abre em janela separada sem barra de URL
- Chrome no Android/iOS → "Adicionar a tela inicial" deve funcionar
- Desconectar internet → navegar no app → paginas ja visitadas devem carregar do cache
- DevTools → Application → Cache Storage → deve conter `/`, `/manifest.json`, `/favicon.svg`

---

### Item 17 - Relatórios IR Brasil e França

**O que foi feito:** Nova pagina `/reports` com seletor de ano (ultimos 6 anos) e abas Brasil/Franca. Para Brasil: cards de resumo (ganho/perda, rendimentos, qtd de ativos), tabela "Ganho de Capital -- Alienacoes" com custo medio ponderado, tabela "Rendimentos Recebidos", tabela "Bens e Direitos em 31/12/ano". Para Franca: mesmos dados com nomenclatura francesa (Plus-values, Revenus mobiliers, Etat du patrimoine). Backend GET /api/reports/:year calcula custo medio por ativo acumulando todas as compras ate o final do ano.

**Como testar:**
- Menu superior → icone ⊞ "IR" → pagina de relatorios abre
- Selecionar ano com vendas → tabela de alienacoes deve aparecer com ganho/perda em verde/vermelho
- Selecionar ano sem vendas → tabela vazia com mensagem
- Verificar rendimentos: apenas contributions do tipo "income" aparecem
- "Bens e Direitos": ativos com posicao > 0 em 31/12 do ano selecionado
- Trocar aba para "Franca" → mesmos dados com texto em frances
- Aviso legal deve aparecer no rodape de cada aba
- Mudar de ano → dados recarregam automaticamente

---

### Item 18 - i18n (pt.json, en.json, fr.json)

**O que foi feito:** `I18nProvider` com hook `useI18n()`. Tres arquivos de traducao: `src/i18n/pt.json`, `en.json`, `fr.json` cobrindo navegacao, perfil, relatorios e strings comuns. Seletor de idioma com bandeiras (🇧🇷🇺🇸🇫🇷) no header, persiste no `localStorage`. AppLayout usa `t.nav.*` para todos os labels de navegacao e botao "Sair". I18nProvider envolvido em App.tsx.

**Como testar:**
- Header → clicar na bandeira 🇺🇸 → labels do menu mudam para ingles (Dashboard, Performance, Contributions, etc.)
- Clicar na bandeira 🇫🇷 → labels mudam para frances (Tableau de bord, Apports, etc.)
- Recarregar a pagina → idioma selecionado persiste (salvo no localStorage)
- Abrir no celular → nav mobile tambem exibe os labels traduzidos
- Clicar em 🇧🇷 → volta para portugues
- Navegar entre paginas com idioma trocado → seletor permanece ativo no mesmo idioma

---

### Item 19 - Login page melhorias

**O que foi feito:** Logo SVG do portfolio no topo. Toggle "Mostrar/Ocultar" na senha. Fluxo "Esqueceu a senha?" abre modo `forgot` com campo de email e envia reset via `supabase.auth.resetPasswordForEmail`. Spinner animado durante loading. Rodape com link para andregutto.com. Layout com melhor hierarquia visual e separacao de erros vs informacoes (vermelho vs azul).

**Como testar:**
- Acessar portfolio.andregutto.com/login (ou deslogar)
- Logo SVG deve aparecer no topo
- Campo senha → clicar "Mostrar" → senha deve ficar visivel → "Ocultar" → volta a ocultar
- Clicar "Esqueceu a senha?" → campo senha some, instrucao aparece, botao muda para "Enviar email"
- Digitar email valido → clicar "Enviar email" → mensagem azul "Email de redefinicao enviado"
- Clicar "← Voltar ao login" → volta ao modo login
- Login com credenciais erradas → mensagem vermelha com erro do Supabase
- Login com credenciais corretas → redireciona para dashboard
- Botao "Entrar" durante carregamento → spinner animado visivel
- Rodape → link "andregutto.com" deve abrir em nova aba
