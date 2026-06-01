import { NextResponse } from 'next/server'
import { getSupabaseSQ } from '@/lib/supabase-sq'

const DEFAULT_SERVICES = [
  {
    sort_order: 1,
    category: 'technique',
    name: 'Site web vitrine',
    description: 'Conception et mise en ligne d\'un site professionnel 5 pages (accueil, services/menu, à propos, galerie, contact). Design sur mesure, optimisé mobile et Google. Hébergement, nom de domaine et mises à jour techniques inclus dans l\'abonnement mensuel. Les photos sont fournies par le client ; séance photo disponible en option.',
    price_setup: 700,
    price_monthly: 90,
  },
  {
    sort_order: 2,
    category: 'contenu',
    name: 'Gestion Instagram',
    description: '8 publications par mois : visuels conçus par l\'agence (design graphique à partir des photos fournies par le client ou visuels IA/stock), légendes rédigées et hashtags optimisés. Planification et publication incluses. Ne comprend pas le déplacement pour photos — voir Séance photo.',
    price_setup: 0,
    price_monthly: 280,
  },
  {
    sort_order: 3,
    category: 'contenu',
    name: 'Gestion réseaux sociaux (Instagram + Facebook)',
    description: '8 posts Instagram + 4 posts Facebook par mois, stories hebdomadaires, réponse aux commentaires. Tous les visuels et textes sont créés par l\'agence sur la base des photos fournies par le client. Idéal pour les établissements avec clientèle locale et de passage.',
    price_setup: 0,
    price_monthly: 380,
  },
  {
    sort_order: 4,
    category: 'seo',
    name: 'Référencement local (SEO + Google Business)',
    description: 'Optimisation complète de la fiche Google Business Profile (photos, horaires, catégories, posts), création et nettoyage de citations locales, suivi du positionnement sur les recherches de proximité. Rapport mensuel avec évolution du classement. Résultats visibles en 2-3 mois.',
    price_setup: 0,
    price_monthly: 160,
  },
  {
    sort_order: 5,
    category: 'seo',
    name: 'Gestion des avis Google (IA)',
    description: 'Réponse personnalisée à chaque nouvel avis Google — positifs et négatifs — dans un délai de 48h. Réponses générées par IA, adaptées au ton de l\'établissement et relues avant publication. Un avis sans réponse décourage les nouveaux clients : ce service transforme chaque avis en argument de vente.',
    price_setup: 0,
    price_monthly: 90,
  },
  {
    sort_order: 6,
    category: 'contenu',
    name: 'Email marketing',
    description: 'Conception et envoi d\'une newsletter mensuelle : template à votre image, rédaction du contenu (actualités, offres, événements), gestion de la liste de contacts. Suivi des taux d\'ouverture et de clics. Plateforme d\'envoi incluse jusqu\'à 2 000 contacts. Idéal pour fidéliser une clientèle régulière.',
    price_setup: 0,
    price_monthly: 130,
  },
  {
    sort_order: 7,
    category: 'publicite',
    name: 'Campagnes publicitaires (Meta / Google Ads)',
    description: 'Création et gestion de campagnes géolocalisées sur Meta Ads (Instagram/Facebook) et/ou Google Ads. Ciblage par zone, âge et intérêts, optimisation hebdomadaire, rapport mensuel de performance. Budget publicitaire non inclus dans le tarif agence — recommandé : 150 à 300€/mois en plus selon l\'objectif.',
    price_setup: 0,
    price_monthly: 220,
  },
  {
    sort_order: 8,
    category: 'photo',
    name: 'Séance photo professionnelle',
    description: 'Déplacement dans votre établissement pour une séance de 2h : plats, produits, espace, équipe. Livraison de 30 photos retouchées en haute résolution sous 5 jours, utilisables pour le site, Instagram et Google Maps. Ce service est facturé une fois à la demande, non renouvelable automatiquement.',
    price_setup: 380,
    price_monthly: 0,
  },
  {
    sort_order: 9,
    category: 'pack',
    name: 'Pack Essentiel',
    description: 'Instagram (8 posts/mois) + Référencement local + Gestion des avis Google (IA). Le trio indispensable pour être visible sur Google, rassurer les nouveaux clients et maintenir une présence active sur Instagram — sans avoir à gérer quoi que ce soit.',
    price_setup: 0,
    price_monthly: 480,
  },
  {
    sort_order: 10,
    category: 'pack',
    name: 'Pack Complet',
    description: 'Site web vitrine + Instagram (8 posts/mois) + Référencement local + Gestion des avis Google (IA). Présence digitale complète, entièrement gérée par l\'agence. Économie de 140€/mois par rapport aux services séparés. Idéal pour les établissements qui démarrent ou qui veulent refaire leur image de zéro.',
    price_setup: 700,
    price_monthly: 580,
  },
]

export async function POST() {
  const sb = getSupabaseSQ()
  if (!sb) return NextResponse.json({ error: 'no db' }, { status: 503 })

  const { count } = await sb.from('sq_services').select('*', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return NextResponse.json({ message: 'Catalogue déjà initialisé', count })

  const { data, error } = await sb.from('sq_services').insert(DEFAULT_SERVICES as any).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, inserted: data?.length ?? 0 })
}
