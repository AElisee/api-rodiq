import { randomBytes } from 'node:crypto';
import { slugify } from '../prestations/prestations.rules';

// Règles vérifiées par les écrans Boutique du front (lib/produits.ts), revérifiées ici

export const CONTENANCE_UNITES = ['ml', 'cl', 'L'] as const;
export const POIDS_UNITES = ['g', 'kg'] as const;

export const NIVEAUX_STOCK = ['ok', 'faible', 'epuise'] as const;
export type NiveauStock = (typeof NIVEAUX_STOCK)[number];

export const SEUIL_STOCK_FAIBLE_DEFAUT = 3;

// Quantité maximale annoncée au site par produit ou déclinaison : le site limite le panier sans
// connaître le stock exact (information commerciale réservée à l'admin)
export const QUANTITE_MAX_PAR_LIGNE = 10;

export const MAX_PHOTOS = 4;
export const MAX_PHOTO_BYTES = 600 * 1024;

// Longueur d'une photo en data URL : base64 (4 caractères pour 3 octets) + en-tête
export const PHOTO_DATA_URL_MAX_LENGTH =
  Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 40;

// Corps JSON accepté par l'ajout d'un produit (4 photos de 600 Ko en base64 ≈ 3,3 Mo, plus les
// champs). Les autres routes restent limitées à 1 Mo (main.ts)
export const PRODUCT_CREATION_BODY_LIMIT = '4mb';
export const PRODUCT_CREATION_PATH = '/api/admin/boutique/produits';

// Segments de route sous /admin/boutique/categories : jamais pris comme identifiant
const RESERVED_CATEGORY_IDS = new Set(['ordre']);

// Identifiant d'une nouvelle catégorie : slug du nom, suffixé -2, -3… s'il est déjà pris
export const newProductCategoryId = (nom: string, taken: Iterable<string>) => {
  const ids = new Set([...taken, ...RESERVED_CATEGORY_IDS]);
  const base = slugify(nom).slice(0, 70) || 'categorie';
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

// Produit : slug du nom + 6 caractères aléatoires (l'identifiant n'apprend rien sur le catalogue)
export const newProductId = (nom: string) =>
  `${slugify(nom).slice(0, 90) || 'produit'}-${randomBytes(3).toString('hex')}`;

export const newVariantId = () => randomBytes(4).toString('hex');

export const stockLevel = (stock: number, seuil: number): NiveauStock =>
  stock <= 0 ? 'epuise' : stock <= seuil ? 'faible' : 'ok';

// Niveau le plus critique du produit : une seule déclinaison épuisée suffit à alerter
export const productLevel = (
  stock: number,
  variants: { stock: number }[],
  seuil: number,
): NiveauStock => {
  const levels = variants.length
    ? variants.map((v) => stockLevel(v.stock, seuil))
    : [stockLevel(stock, seuil)];
  if (levels.includes('epuise')) return 'epuise';
  return levels.includes('faible') ? 'faible' : 'ok';
};

export const publicQuantity = (stock: number) =>
  Math.max(0, Math.min(stock, QUANTITE_MAX_PAR_LIGNE));

type VariantInput = { id?: string; nom: string };

// Écarts entre les déclinaisons envoyées et celles du produit (un message par écart, avec le nom).
// Une déclinaison existante garde son identifiant (les commandes y font référence) ; sans identifiant,
// elle est créée
export const variantErrors = (
  sent: VariantInput[],
  existingIds: Iterable<string>,
) => {
  const existing = new Set(existingIds);
  const errors: string[] = [];
  const names = new Map<string, string>();
  const ids = new Set<string>();
  for (const { id, nom } of sent) {
    if (id !== undefined && !existing.has(id)) {
      errors.push(
        `La déclinaison « ${nom} » n’appartient pas à ce produit ou a été supprimée : rechargez la fiche`,
      );
    } else if (id !== undefined && ids.has(id)) {
      errors.push(`La déclinaison « ${nom} » est envoyée deux fois`);
    }
    if (id !== undefined) ids.add(id);
    const key = slugify(nom);
    const twin = names.get(key);
    if (twin !== undefined) {
      errors.push(
        `Deux déclinaisons portent le même nom : « ${twin} » et « ${nom} »`,
      );
    } else names.set(key, nom);
  }
  return errors;
};

// Cohérence prix / stock d'un produit (les bornes de chaque champ sont vérifiées par le DTO)
export const productErrors = ({
  prix,
  prixBarre,
  stock,
  declinaisons,
}: {
  prix: number;
  prixBarre?: number | null;
  stock?: number;
  declinaisons: unknown[];
}) => {
  const errors: string[] = [];
  if (prixBarre != null && prixBarre <= prix) {
    errors.push(
      `Le prix barré (${prixBarre} FCFA) doit être supérieur au prix de vente (${prix} FCFA)`,
    );
  }
  if (!declinaisons.length && stock === undefined) {
    errors.push('Indiquez la quantité en stock du produit');
  }
  if (declinaisons.length && stock) {
    errors.push(
      'Un produit à déclinaisons n’a pas de stock propre : indiquez le stock de chaque déclinaison',
    );
  }
  return errors;
};

// Formats acceptés pour les photos : signature binaire de chaque type. Pas de SVG : il peut
// contenir du script, et une photo n'en a pas besoin
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/webp': (b) =>
    b.toString('latin1', 0, 4) === 'RIFF' &&
    b.toString('latin1', 8, 12) === 'WEBP',
};

export const PHOTO_DATA_URL =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Décode une photo en data URL et vérifie que le contenu est bien du type annoncé.
 * Renvoie le type et les octets, ou le message d'erreur à afficher
 */
export const decodePhoto = (
  dataUrl: string,
): { type: string; data: Buffer } | { error: string } => {
  const match = PHOTO_DATA_URL.exec(dataUrl);
  if (!match) {
    return { error: 'Photo invalide : JPEG, PNG ou WebP en data URL base64' };
  }
  const [, type, base64] = match;
  const data = Buffer.from(base64, 'base64');
  if (data.length > MAX_PHOTO_BYTES) {
    return {
      error: `Photo trop lourde (${Math.ceil(data.length / 1024)} Ko) : ${MAX_PHOTO_BYTES / 1024} Ko maximum`,
    };
  }
  if (data.length < 12 || !SIGNATURES[type](data)) {
    return {
      error: `Photo refusée : le fichier n’est pas une vraie image ${type.slice(6).toUpperCase()}`,
    };
  }
  return { type, data };
};
