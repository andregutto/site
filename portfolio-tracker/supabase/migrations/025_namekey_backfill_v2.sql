-- name_key backfill (v2) — sem unaccent, variantes já listadas explicitamente

-- ── Asset classes ─────────────────────────────────────────────────────────────

UPDATE asset_classes SET name_key = 'classAcoesBrasil'
WHERE name_key IS NULL AND LOWER(name) IN (
  'acoes brasil','ações brasil','acoes br','ações br',
  'renda variavel brasil','renda variável brasil',
  'brazilian stocks','brazilian equities','bolsa brasil','bolsa'
);

UPDATE asset_classes SET name_key = 'classAcoesExterior'
WHERE name_key IS NULL AND LOWER(name) IN (
  'acoes exterior','ações exterior','acoes internacionais','ações internacionais',
  'acoes eua','ações eua','internacional','internacionais','acoes us',
  'international stocks','international equities','stocks exterior',
  'bdr','bdrs','stocks eua'
);

UPDATE asset_classes SET name_key = 'classFiis'
WHERE name_key IS NULL AND LOWER(name) IN (
  'fiis','fii','fundos imobiliarios','fundos imobiliários',
  'fundo imobiliario','fundo imobiliário',
  'reit','reits','real estate investment trust'
);

UPDATE asset_classes SET name_key = 'classCripto'
WHERE name_key IS NULL AND LOWER(name) IN (
  'cripto','crypto','criptomoedas','criptomoeda',
  'cryptocurrency','cryptocurrencies','bitcoin','btc','ethereum','eth'
);

UPDATE asset_classes SET name_key = 'classRendaFixa'
WHERE name_key IS NULL AND LOWER(name) IN (
  'renda fixa','fixed income','revenus fixes','tesouro',
  'tesouro direto','cdb','lci','lca','cri','cra','debentures',
  'renda-fixa','titulos','titulos publicos','títulos públicos'
);

UPDATE asset_classes SET name_key = 'classPrevidencia'
WHERE name_key IS NULL AND LOWER(name) IN (
  'previdencia','previdência','previdencia privada','previdência privada',
  'pension','prevoyance','prévoyance','pgbl','vgbl',
  'aposentadoria','complementar'
);

UPDATE asset_classes SET name_key = 'classImoveis'
WHERE name_key IS NULL AND LOWER(name) IN (
  'imoveis','imóveis','imobiliario','imobiliário',
  'imovel','imóvel','real estate','immobilier',
  'propriedades','propriedade','terrenos','terreno'
);

UPDATE asset_classes SET name_key = 'classCaixa'
WHERE name_key IS NULL AND LOWER(name) IN (
  'caixa','cash','liquidez','liquidites','liquidités',
  'reserva','reserva de emergencia','reserva de emergência',
  'conta corrente','poupanca','poupança','dinheiro'
);

-- ── Finance categories ────────────────────────────────────────────────────────

UPDATE finance_categories SET name_key = 'categoryGroceries'
WHERE name_key IS NULL AND LOWER(name) IN (
  'alimentacao','alimentação','mercado','supermercado','feira',
  'groceries','alimentation','courses','supermarche','supermarché',
  'padaria','hortifruti','acougue','açougue'
);

UPDATE finance_categories SET name_key = 'categoryRestaurant'
WHERE name_key IS NULL AND LOWER(name) IN (
  'restaurantes','restaurante','restaurant','restaurants',
  'refeicao','refeição','refeicoes','refeições',
  'dining','comida','lanches','lanche','delivery','ifood',
  'alimentos','alimentacao fora','alimentação fora'
);

UPDATE finance_categories SET name_key = 'categoryTransport'
WHERE name_key IS NULL AND LOWER(name) IN (
  'transporte','transport','transportation','mobilidade',
  'deslocamentos','deplacements','déplacements',
  'uber','taxi','táxi','metro','metrô','onibus','ônibus',
  'combustivel','combustível','gasolina','pedagio','pedágio',
  'estacionamento','carro','veiculo','veículo'
);

UPDATE finance_categories SET name_key = 'categoryHealth'
WHERE name_key IS NULL AND LOWER(name) IN (
  'saude','saúde','health','sante','santé',
  'medico','médico','medicos','médicos','consulta','consultas',
  'plano de saude','plano de saúde','convenio','convênio',
  'exames','laboratorio','laboratório','hospital','clinica','clínica',
  'dentista','odontologia','academia','gym','ginasio','ginásio'
);

UPDATE finance_categories SET name_key = 'categoryEntertainment'
WHERE name_key IS NULL AND LOWER(name) IN (
  'lazer','entretenimento','entertainment','loisirs',
  'divertimento','diversao','diversão',
  'cinema','teatro','show','shows','jogos','games',
  'esportes','esporte','cultura','passeio','passeios'
);

UPDATE finance_categories SET name_key = 'categoryHousing'
WHERE name_key IS NULL AND LOWER(name) IN (
  'moradia','habitacao','habitação','housing','logement',
  'aluguel','loyer','rent','condominio','condomínio',
  'iptu','casa','apartamento','manutencao','manutenção',
  'reformas','reforma','agua','água','luz','energia eletrica',
  'energia elétrica'
);

UPDATE finance_categories SET name_key = 'categoryStreaming'
WHERE name_key IS NULL AND LOWER(name) IN (
  'streaming','stream','streams',
  'netflix','spotify','disney','amazon prime','hbo','youtube'
);

UPDATE finance_categories SET name_key = 'categorySubscriptions'
WHERE name_key IS NULL AND LOWER(name) IN (
  'assinaturas','assinatura','subscriptions','abonnements','abonnement',
  'mensalidades','mensalidade','planos','plano',
  'servicos digitais','serviços digitais','software','saas'
);

UPDATE finance_categories SET name_key = 'categoryPharmacy'
WHERE name_key IS NULL AND LOWER(name) IN (
  'farmacia','farmácia','pharmacy','pharmacie',
  'remedios','remédios','medicamentos','drogaria'
);

UPDATE finance_categories SET name_key = 'categoryClothing'
WHERE name_key IS NULL AND LOWER(name) IN (
  'vestuario','vestuário','roupas','roupa','clothing',
  'vetements','vêtements','moda','calcados','calçados',
  'acessorios','acessórios'
);

UPDATE finance_categories SET name_key = 'categoryTravel'
WHERE name_key IS NULL AND LOWER(name) IN (
  'viagem','viagens','travel','voyage','voyages',
  'ferias','férias','hotel','hospedagem','voo','voos',
  'passagem','passagens','turismo','vacances'
);

UPDATE finance_categories SET name_key = 'categoryCoffee'
WHERE name_key IS NULL AND LOWER(name) IN (
  'cafe','café','coffee','cafeteria','cafezinho','padaria cafe'
);

UPDATE finance_categories SET name_key = 'categoryUtilities'
WHERE name_key IS NULL AND LOWER(name) IN (
  'utilidades','utilities','charges','contas','conta',
  'agua','água','energia','luz','gas','gás','internet',
  'telefone','celular','tv a cabo','cabo'
);

UPDATE finance_categories SET name_key = 'categoryEducation'
WHERE name_key IS NULL AND LOWER(name) IN (
  'educacao','educação','education','ensino',
  'curso','cursos','faculdade','escola','mensalidade escolar',
  'livros','material escolar','idiomas','ingles','inglês'
);

UPDATE finance_categories SET name_key = 'categoryPersonalCare'
WHERE name_key IS NULL AND LOWER(name) IN (
  'cuidados pessoais','beleza','personal care','soins personnels',
  'beaute','beauté','higiene','barbearia','cabeleireiro',
  'salao','salão','estetica','estética','cosmeticos','cosméticos'
);

UPDATE finance_categories SET name_key = 'categoryElectronics'
WHERE name_key IS NULL AND LOWER(name) IN (
  'tecnologia','eletronicos','eletrônicos','electronics',
  'electronique','électronique','informatica','informática',
  'celular','smartphone','computador','notebook','tablet',
  'eletrodomesticos','eletrodomésticos'
);

UPDATE finance_categories SET name_key = 'categoryAirbnb'
WHERE name_key IS NULL AND LOWER(name) = 'airbnb';

UPDATE finance_categories SET name_key = 'categoryOther'
WHERE name_key IS NULL AND LOWER(name) IN (
  'outros','outro','other','autres','autre',
  'misc','miscellaneous','diversos','diverso','geral'
);
