import { randomBytes } from 'node:crypto';

// Règles vérifiées par les écrans Prestations du front, revérifiées ici

// Même transformation que `slugify` de l'écran Prestations du front
export const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// Segments de route sous /admin/prestations/categories : jamais pris comme identifiant
const RESERVED_IDS = new Set(['ordre']);

// Identifiant d'une nouvelle catégorie : slug du nom, suffixé -2, -3… s'il est déjà pris
export const newCategoryId = (nom: string, taken: Iterable<string>) => {
  const ids = new Set([...taken, ...RESERVED_IDS]);
  const base = slugify(nom).slice(0, 70) || 'categorie';
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

// Identifiant d'une nouvelle prestation : slug du nom + 4 caractères aléatoires
export const newPrestationId = (nom: string) =>
  `${slugify(nom).slice(0, 90) || 'prestation'}-${randomBytes(2).toString('hex')}`;

// Deux noms identiques à la casse et aux accents près
export const sameName = (a: string, b: string) => slugify(a) === slugify(b);

// Un nouvel ordre doit reprendre chaque identifiant existant une fois, sans en ajouter.
// Renvoie un message par écart, avec le nom quand l'élément existe (tableau vide si l'ordre est valable)
export const orderErrors = (
  ids: string[],
  existing: { id: string; nom: string }[],
) => {
  const names = new Map(existing.map(({ id, nom }) => [id, nom]));
  const label = (id: string) => `« ${names.get(id) ?? id} »`;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const id of ids) {
    if (!names.has(id))
      errors.push(`${label(id)} n’existe pas ou a été supprimée`);
    else if (seen.has(id)) errors.push(`${label(id)} apparaît plusieurs fois`);
    seen.add(id);
  }
  for (const { id } of existing) {
    if (!seen.has(id)) errors.push(`${label(id)} manque dans la liste`);
  }
  return errors;
};
