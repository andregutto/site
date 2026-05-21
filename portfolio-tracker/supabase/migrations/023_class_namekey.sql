-- Add name_key to asset_classes for i18n support
ALTER TABLE asset_classes ADD COLUMN IF NOT EXISTS name_key TEXT;

-- Backfill the 7 default classes created for André
UPDATE asset_classes SET name_key = 'classAcoesBrasil'   WHERE name_key IS NULL AND LOWER(name) IN ('ações brasil','acoes brasil','brazilian stocks','brazilian equities');
UPDATE asset_classes SET name_key = 'classAcoesExterior' WHERE name_key IS NULL AND LOWER(name) IN ('ações exterior','acoes exterior','international stocks','international equities','stocks exterior');
UPDATE asset_classes SET name_key = 'classFiis'          WHERE name_key IS NULL AND LOWER(name) IN ('fiis','reit','reits','fii');
UPDATE asset_classes SET name_key = 'classCripto'        WHERE name_key IS NULL AND LOWER(name) IN ('cripto','crypto','criptomoedas','cryptocurrency');
UPDATE asset_classes SET name_key = 'classRendaFixa'     WHERE name_key IS NULL AND LOWER(name) IN ('renda fixa','fixed income','revenus fixes');
UPDATE asset_classes SET name_key = 'classPrevidencia'   WHERE name_key IS NULL AND LOWER(name) IN ('previdência','previdencia','pension','prévoyance','prevoyance');
UPDATE asset_classes SET name_key = 'classImoveis'       WHERE name_key IS NULL AND LOWER(name) IN ('imóveis','imoveis','real estate','immobilier');

-- Backfill common finance categories (expand on migration 021)
UPDATE finance_categories SET name_key = 'categoryGroceries'     WHERE name_key IS NULL AND LOWER(name) IN ('alimentação','alimentacao','mercado','supermercado','groceries','alimentation','courses','supermarché','supermarche');
UPDATE finance_categories SET name_key = 'categoryRestaurant'    WHERE name_key IS NULL AND LOWER(name) IN ('restaurantes','restaurante','restaurant','restaurants','dining','refeição','refeicao');
UPDATE finance_categories SET name_key = 'categoryTransport'     WHERE name_key IS NULL AND LOWER(name) IN ('transporte','transport','transportation','déplacements','deplacements','mobilidade');
UPDATE finance_categories SET name_key = 'categoryHealth'        WHERE name_key IS NULL AND LOWER(name) IN ('saúde','saude','health','santé','sante','médico','medico');
UPDATE finance_categories SET name_key = 'categoryEntertainment' WHERE name_key IS NULL AND LOWER(name) IN ('lazer','entretenimento','entertainment','loisirs','divertimento');
UPDATE finance_categories SET name_key = 'categoryHousing'       WHERE name_key IS NULL AND LOWER(name) IN ('moradia','habitação','habitacao','housing','logement','aluguel','loyer');
UPDATE finance_categories SET name_key = 'categoryStreaming'     WHERE name_key IS NULL AND LOWER(name) IN ('streaming','stream');
UPDATE finance_categories SET name_key = 'categorySubscriptions' WHERE name_key IS NULL AND LOWER(name) IN ('assinaturas','assinatura','subscriptions','abonnements','abonnement');
UPDATE finance_categories SET name_key = 'categoryPharmacy'      WHERE name_key IS NULL AND LOWER(name) IN ('farmácia','farmacia','pharmacy','pharmacie');
UPDATE finance_categories SET name_key = 'categoryClothing'      WHERE name_key IS NULL AND LOWER(name) IN ('vestuário','vestuario','roupas','roupa','clothing','vêtements','vetements');
UPDATE finance_categories SET name_key = 'categoryTravel'        WHERE name_key IS NULL AND LOWER(name) IN ('viagem','viagens','travel','voyage','voyages');
UPDATE finance_categories SET name_key = 'categoryCoffee'        WHERE name_key IS NULL AND LOWER(name) IN ('café','cafe','coffee');
UPDATE finance_categories SET name_key = 'categoryUtilities'     WHERE name_key IS NULL AND LOWER(name) IN ('utilidades','utilities','charges','água','agua','energia','luz','internet');
UPDATE finance_categories SET name_key = 'categoryEducation'     WHERE name_key IS NULL AND LOWER(name) IN ('educação','educacao','education','éducation','curso','cursos');
UPDATE finance_categories SET name_key = 'categoryPersonalCare'  WHERE name_key IS NULL AND LOWER(name) IN ('cuidados pessoais','beleza','personal care','soins personnels','beauté','beaute','hygiene','higiene');
UPDATE finance_categories SET name_key = 'categoryElectronics'   WHERE name_key IS NULL AND LOWER(name) IN ('tecnologia','eletrônicos','eletronicos','electronics','électronique','electronique');
UPDATE finance_categories SET name_key = 'categoryAirbnb'        WHERE name_key IS NULL AND LOWER(name) = 'airbnb';
UPDATE finance_categories SET name_key = 'categoryOther'         WHERE name_key IS NULL AND LOWER(name) IN ('outros','outro','other','autres','autre','misc','miscellaneous');
