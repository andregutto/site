// Categorias vêm de texto livre (digitado pelo usuário ou nome de lista do
// Google Takeout, quase sempre em PT) — não dá pra traduzir texto livre
// automaticamente, mas as categorias mais comuns batem com essas palavras-
// chave, então pelo menos essas aparecem no idioma do usuário. O resto
// (categorias incomuns) continua como foi cadastrado. Mesma lista usada em
// PublicTripPage.tsx, reaproveita as chaves voyage.public.category.*.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  restaurantes: 'restaurants', restaurante: 'restaurants',
  padarias: 'bakeries', padaria: 'bakeries',
  cafés: 'cafes', café: 'cafes', cafes: 'cafes',
  museus: 'museums', museu: 'museums',
  hotéis: 'hotels', hotel: 'hotels', hoteis: 'hotels',
  bares: 'bars', bar: 'bars',
  praias: 'beaches', praia: 'beaches',
  parques: 'parks', parque: 'parks',
  compras: 'shopping', mercados: 'markets',
  pontos: 'touristSpots', turísticos: 'touristSpots', favoritos: 'favorites',
  aluguel: 'carRental', carro: 'carRental', carros: 'carRental',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function categoryLabel(cat: string | null, tv: any): string | null {
  if (!cat) return null
  const key = cat.toLowerCase()
  for (const [k, labelKey] of Object.entries(CATEGORY_LABEL_KEYS)) {
    if (key.includes(k)) return tv.public?.category?.[labelKey] ?? cat
  }
  return cat
}
