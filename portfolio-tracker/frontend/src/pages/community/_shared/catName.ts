/* Seed categories translate via i18n (community.cat.<slug>); categories
   created in the admin panel carry a literal name in the DB. */
export function catName(tc: any, c: { slug: string; name?: string | null } | null | undefined): string {
  if (!c) return ''
  return tc?.cat?.[c.slug] ?? c.name ?? c.slug
}
