# Portfolio Tracker — Arquitetura

## Tipos de ativo e fonte de dados

| Tipo | Campo `asset_type` | Fonte de valor | Exemplo |
|---|---|---|---|
| Ticker Brasil | `ticker` | brapi.dev | PETR4, HSML11 |
| Ticker USA | `ticker` | Yahoo Finance | META, IVV |
| Cripto | `ticker` | CoinGecko | BTC, ETH, SOL |
| Renda Fixa | `fixed_income` | BCB API (CDI/IPCA) | CDB, Tesouro |
| Manual | `manual` | Usuário digita | NATIXIS, REVOLUT |

## APIs externas

| API | URL base | Uso |
|---|---|---|
| brapi.dev | `https://brapi.dev/api` | Cotações B3 (ações, FIIs, ETFs BR) |
| Yahoo Finance | `https://query1.finance.yahoo.com` | Cotações USA/globais |
| CoinGecko | `https://api.coingecko.com/api/v3` | Preços cripto |
| AwesomeAPI | `https://economia.awesomeapi.com.br` | Câmbio em tempo real |
| BCB | `https://api.bcb.gov.br/dados/serie` | CDI diário (série 12), IPCA mensal (série 433) |

## Cálculo de Renda Fixa

### Pós-fixado (% CDI)
```
valor = principal × Π(1 + CDI_diário × fi_rate) para cada dia útil
```
- `fi_rate` = multiplicador (1.025 = 102,5% CDI)
- CDI diário vem da série BCB 12

### Pré-fixado
```
valor = principal × (1 + fi_rate)^(dias_úteis / 252)
```
- `fi_rate` = taxa a.a. decimal (0.125 = 12,5% a.a.)

### Híbrido (IPCA+)
```
valor = principal × IPCA_acumulado × (1 + fi_spread)^(dias_úteis / 252)
```
- `fi_spread` = taxa adicional a.a. decimal
- IPCA mensal vem da série BCB 433

## Câmbio

- Todas as APIs retornam preços na moeda nativa do ativo
- Conversão para BRL sempre via AwesomeAPI no momento do cálculo
- Cache em `fx_rates` (1 registro por par por dia)
- Pares suportados: USD/BRL, EUR/BRL, EUR/USD (extensível)

## Schema resumido

```
assets          → cadastro de ativos (3 tipos)
contributions   → compras/vendas (ticker assets)
price_history   → cache de cotações das APIs (ticker assets)
manual_values   → saldo mensal informado pelo usuário (manual assets)
fx_rates        → cache de câmbio (AwesomeAPI)
bcb_rates       → cache CDI/IPCA diário (BCB API)
benchmarks      → IBOV, S&P500, CDI acumulado (para comparação)
asset_classes   → classes definidas pelo usuário (com cor e % alvo)
profiles        → preferências do usuário (moeda base, etc.)
```

## Fluxo de cadastro de ativo (ticker)

1. Usuário escolhe classe
2. Busca ticker (autocomplete via brapi/Yahoo/CoinGecko)
3. Informa quantidade + data + preço pago (opcional)
4. Sistema calcula valor atual via API automaticamente

## Fluxo de cadastro — Renda Fixa

1. Usuário escolhe "Renda Fixa"
2. Informa: nome, principal, data início, tipo (pós/pré/híbrido), taxa, vencimento
3. Sistema calcula valor atual via CDI/IPCA do BCB automaticamente
4. Sem necessidade de atualização manual

## Fluxo de cadastro — Manual

1. Usuário escolhe "Manual"
2. Informa: nome, moeda
3. Todo mês (dia 1): informa o saldo atual
4. Sistema consolida com câmbio do dia
