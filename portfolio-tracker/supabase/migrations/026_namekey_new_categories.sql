-- name_key backfill for new finance categories

UPDATE finance_categories SET name_key = 'categoryGifts'
WHERE name_key IS NULL AND LOWER(name) IN (
  'presentes','presente','gifts','gift','cadeaux','cadeau'
);

UPDATE finance_categories SET name_key = 'categoryShopping'
WHERE name_key IS NULL AND LOWER(name) IN (
  'compras','compra','shopping','achats','achat',
  'lojas','loja','store','stores'
);

UPDATE finance_categories SET name_key = 'categoryTaxes'
WHERE name_key IS NULL AND LOWER(name) IN (
  'impostos','imposto','taxes','tax','impots','impôts',
  'ir','irpf','itbi','ipva','iof','tributos','tributo'
);

UPDATE finance_categories SET name_key = 'categoryFees'
WHERE name_key IS NULL AND LOWER(name) IN (
  'taxas','taxa','taxas e tarifas','fees','fee',
  'frais','charges','tarifas','tarifa',
  'tarifas bancarias','tarifas bancárias','taxas bancarias','taxas bancárias',
  'anuidade','anuidades','multas','multa'
);

UPDATE finance_categories SET name_key = 'categoryBarsRestaurants'
WHERE name_key IS NULL AND LOWER(name) IN (
  'bares e restaurantes','bar e restaurante','bares','bar',
  'bars and restaurants','bars & restaurants','bars et restaurants',
  'balada','baladas','pub','pubs','happy hour'
);

UPDATE finance_categories SET name_key = 'categoryShowsParties'
WHERE name_key IS NULL AND LOWER(name) IN (
  'shows e festas','show e festa','shows','shows e eventos',
  'festas','festa','shows and parties','spectacles et fetes','spectacles et fêtes',
  'eventos','evento','concerts','concert','festival','festivais'
);
