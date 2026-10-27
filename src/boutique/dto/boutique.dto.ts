import { ApiProperty, IntersectionType, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../common/transforms';
import {
  CONTENANCE_UNITES,
  MAX_PHOTO_BYTES,
  PHOTO_DATA_URL_MAX_LENGTH,
  NIVEAUX_STOCK,
  POIDS_UNITES,
  type NiveauStock,
} from '../boutique.rules';

// Boutique : catégories et produits, vus par le site (public) ou par l'admin
// (même structure que `ProductCategory` / `Product` de `lib/produits.ts` du front, noms en français)

// ───────────── Catégories ─────────────

/** Catégorie de la boutique */
export class CategorieBoutiqueDto {
  /**
   * Slug tiré du nom à la création, conservé ensuite (filtre `?categorie=` du site)
   * @example "vernis"
   */
  id: string;

  /** @example "Vernis" */
  nom: string;

  /**
   * Texte des fiches produit sans description propre (chaîne vide si aucun)
   * @example "Une couleur soigneusement choisie pour sublimer vos ongles…"
   */
  description: string;
}

/** Catégorie vue par l'admin */
export class CategorieBoutiqueAdminDto extends CategorieBoutiqueDto {
  /**
   * Produits de la catégorie, masqués compris (une catégorie non vide ne peut pas être supprimée)
   * @example 12
   */
  nombreProduits: number;
}

/** Ajout ou modification d'une catégorie */
export class SaveCategorieBoutiqueDto {
  /**
   * Nom unique (casse et accents ignorés)
   * @example "Vernis"
   */
  @Transform(trim)
  @IsString({ message: 'Le nom de la catégorie doit être un texte' })
  @MinLength(2, { message: 'Nom de la catégorie : 2 caractères au moins' })
  @MaxLength(60, { message: 'Nom de la catégorie : 60 caractères au plus' })
  nom: string;

  /**
   * Texte des fiches produit sans description propre, vide ou absent si aucun
   * @example "Une couleur soigneusement choisie pour sublimer vos ongles…"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La description doit être un texte' })
  @MaxLength(500, { message: 'Description : 500 caractères au plus' })
  description?: string;
}

// ───────────── Produits : lecture ─────────────

/** Contenance (ml, cl, L) */
export class ContenanceDto {
  /** @example 300 */
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'Contenance : un nombre (2 décimales au plus)' },
  )
  @Min(0.01, { message: 'Contenance : supérieure à 0' })
  @Max(100_000, { message: 'Contenance : 100 000 au plus' })
  valeur: number;

  @ApiProperty({ enum: CONTENANCE_UNITES, example: 'ml' })
  @IsIn(CONTENANCE_UNITES, { message: 'Unité de contenance : ml, cl ou L' })
  unite: (typeof CONTENANCE_UNITES)[number];
}

/** Poids (g, kg) */
export class PoidsDto {
  /** @example 1 */
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'Poids : un nombre (2 décimales au plus)' },
  )
  @Min(0.01, { message: 'Poids : supérieur à 0' })
  @Max(100_000, { message: 'Poids : 100 000 au plus' })
  valeur: number;

  @ApiProperty({ enum: POIDS_UNITES, example: 'kg' })
  @IsIn(POIDS_UNITES, { message: 'Unité de poids : g ou kg' })
  unite: (typeof POIDS_UNITES)[number];
}

/** Champs communs du produit, côté site et admin */
class ProduitBaseDto {
  /** @example "vernis-nude-rose-3f2a9c" */
  id: string;

  /** @example "vernis" */
  categorieId: string;

  /** @example "Vernis nude rosé" */
  nom: string;

  /**
   * Prix payé, en francs CFA
   * @example 6000
   */
  prix: number;

  /**
   * Prix d'origine affiché barré (promotion), null sinon
   * @example 8000
   */
  prixBarre: number | null;

  /** Description propre (chaîne vide : afficher celle de la catégorie) */
  description: string;

  contenance: ContenanceDto | null;

  poids: PoidsDto | null;

  /**
   * Adresses des photos, la première sert de visuel principal (chemins relatifs à l'origine de l'API)
   * @example ["/api/boutique/photos/3b241101-e2bb-4255-8caf-4136c566a962"]
   */
  photos: string[];
}

/** Déclinaison vue par le site */
export class DeclinaisonPubliqueDto {
  /** @example "a1b2c3d4" */
  id: string;

  /** @example "Rose poudré" */
  nom: string;

  /**
   * Quantité qu'on peut mettre au panier (0 : épuisée). Plafonnée à 10 : le stock exact reste privé
   * @example 10
   */
  quantiteMax: number;
}

/** Produit vu par le site (jamais un produit masqué) */
export class ProduitPublicDto extends ProduitBaseDto {
  declinaisons: DeclinaisonPubliqueDto[];

  /**
   * Quantité qu'on peut mettre au panier pour un produit sans déclinaison (0 : épuisé),
   * plafonnée à 10 ; avec déclinaisons, la plus grande des leurs
   * @example 10
   */
  quantiteMax: number;

  /** Plus rien à vendre (toutes les déclinaisons épuisées) */
  epuise: boolean;
}

/** Déclinaison vue par l'admin */
export class DeclinaisonAdminDto {
  /** @example "a1b2c3d4" */
  id: string;

  /** @example "Rose poudré" */
  nom: string;

  /** @example 7 */
  stock: number;

  @ApiProperty({ enum: NIVEAUX_STOCK, example: 'ok' })
  niveauStock: NiveauStock;
}

/** Produit vu par l'admin */
export class ProduitAdminDto extends ProduitBaseDto {
  declinaisons: DeclinaisonAdminDto[];

  /**
   * Stock d'un produit sans déclinaison (0 s'il a des déclinaisons)
   * @example 12
   */
  stock: number;

  /**
   * Stock total (somme des déclinaisons, ou stock du produit)
   * @example 12
   */
  stockTotal: number;

  /** @example 3 */
  seuilStockFaible: number;

  /** Niveau le plus critique : une seule déclinaison épuisée donne `epuise` */
  @ApiProperty({ enum: NIVEAUX_STOCK, example: 'ok' })
  niveauStock: NiveauStock;

  masque: boolean;

  /** Identifiants des photos, dans l'ordre (pour les retirer ou les réordonner) */
  photoIds: string[];

  /**
   * À renvoyer telle quelle avec la modification : refus (409) si le produit a changé entre-temps
   * @example 4
   */
  version: number;

  creeLe: Date;

  modifieLe: Date;
}

class PageDto {
  /**
   * Nombre total de produits correspondant aux filtres
   * @example 42
   */
  total: number;

  /** @example 1 */
  page: number;

  /** @example 24 */
  parPage: number;
}

/** Produit qui vient d'être ajouté */
export class ProduitCreeDto extends ProduitAdminDto {
  /**
   * Une ligne par photo écartée, avec son numéro et la raison (vide si toutes sont enregistrées)
   * @example ["Photo 2 refusée : le fichier n’est pas une vraie image JPEG"]
   */
  photosRefusees: string[];
}

export class ProduitsPublicsPageDto extends PageDto {
  elements: ProduitPublicDto[];
}

export class ProduitsAdminPageDto extends PageDto {
  elements: ProduitAdminDto[];
}

/** Produit ou déclinaison épuisé ou sous son seuil d'alerte */
export class AlerteStockDto {
  /** @example "vernis-nude-rose-3f2a9c" */
  produitId: string;

  /** @example "Vernis nude rosé" */
  produitNom: string;

  /** Déclinaison concernée, null pour un produit sans déclinaison */
  declinaisonId: string | null;

  /** @example "Rose poudré" */
  declinaisonNom: string | null;

  /** @example 0 */
  stock: number;

  @ApiProperty({ enum: ['faible', 'epuise'], example: 'epuise' })
  niveau: Exclude<NiveauStock, 'ok'>;
}

// ───────────── Produits : écriture ─────────────

/** Déclinaison envoyée par l'admin */
export class SaveDeclinaisonDto {
  /**
   * Identifiant d'une déclinaison existante (à reprendre de la fiche) ; absent pour en créer une
   * @example "a1b2c3d4"
   */
  @IsOptional()
  @IsString({ message: 'Identifiant de déclinaison invalide' })
  @Matches(/^[0-9a-f]{8}$/, { message: 'Identifiant de déclinaison invalide' })
  id?: string;

  /** @example "Rose poudré" */
  @Transform(trim)
  @IsString({ message: 'Le nom de la déclinaison doit être un texte' })
  @MinLength(1, { message: 'Chaque déclinaison a un nom' })
  @MaxLength(60, { message: 'Nom de déclinaison : 60 caractères au plus' })
  nom: string;

  /** @example 7 */
  @IsInt({ message: 'Stock d’une déclinaison : un nombre entier' })
  @Min(0, { message: 'Stock d’une déclinaison : 0 au moins' })
  @Max(1_000_000, { message: 'Stock d’une déclinaison : 1 000 000 au plus' })
  stock: number;
}

/** Ajout d'un produit, photos comprises */
export class CreateProduitDto {
  /**
   * Photos facultatives (0 à 4) en data URL base64 (JPEG, PNG ou WebP ; 600 Ko chacune une fois
   * décodée), dans l'ordre d'affichage. Une photo refusée (format, taille, au-delà de 4 photos valables) ne
   * bloque pas l'ajout : elle est écartée et expliquée dans `photosRefusees`
   * @example ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ…"]
   */
  @IsOptional()
  @IsArray({ message: 'Les photos doivent être une liste de data URL' })
  @IsString({ each: true, message: 'Chaque photo doit être une data URL' })
  photos?: string[];

  /** @example "vernis" */
  @IsString({ message: 'Indiquez la catégorie du produit' })
  @MaxLength(80, { message: 'Identifiant de catégorie trop long' })
  categorieId: string;

  /** @example "Vernis nude rosé" */
  @Transform(trim)
  @IsString({ message: 'Le nom du produit doit être un texte' })
  @MinLength(2, { message: 'Nom du produit : 2 caractères au moins' })
  @MaxLength(80, { message: 'Nom du produit : 80 caractères au plus' })
  nom: string;

  /**
   * Prix payé en francs CFA (entier, plus de 0)
   * @example 6000
   */
  @IsInt({ message: 'Prix : un nombre entier de FCFA, sans décimales' })
  @Min(1, { message: 'Prix : 1 FCFA au moins' })
  @Max(10_000_000, { message: 'Prix : 10 000 000 FCFA au plus' })
  prix: number;

  /**
   * Prix d'origine barré, supérieur au prix ; null ou absent hors promotion
   * @example 8000
   */
  @IsOptional()
  @IsInt({ message: 'Prix barré : un nombre entier de FCFA, sans décimales' })
  @Min(1, { message: 'Prix barré : 1 FCFA au moins' })
  @Max(10_000_000, { message: 'Prix barré : 10 000 000 FCFA au plus' })
  prixBarre?: number | null;

  /** Vide ou absente : la fiche affiche la description de la catégorie */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La description doit être un texte' })
  @MaxLength(2000, { message: 'Description : 2 000 caractères au plus' })
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ContenanceDto)
  contenance?: ContenanceDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PoidsDto)
  poids?: PoidsDto | null;

  /** Déclinaisons (20 au plus) ; vide ou absent pour un produit suivi par `stock` */
  @IsOptional()
  @IsArray({ message: 'Les déclinaisons doivent être une liste' })
  @ArrayMaxSize(20, { message: '20 déclinaisons au plus par produit' })
  @ValidateNested({ each: true })
  @Type(() => SaveDeclinaisonDto)
  declinaisons?: SaveDeclinaisonDto[];

  /**
   * Quantité en stock d'un produit sans déclinaison (obligatoire alors) ; absent ou 0 avec déclinaisons
   * @example 12
   */
  @IsOptional()
  @IsInt({ message: 'Stock : un nombre entier' })
  @Min(0, { message: 'Stock : 0 au moins' })
  @Max(1_000_000, { message: 'Stock : 1 000 000 au plus' })
  stock?: number;

  /**
   * Alerte « stock faible » à partir de cette quantité (3 si absent ; 0 : alerte à la rupture seulement)
   * @example 3
   */
  @IsOptional()
  @IsInt({ message: 'Seuil d’alerte : un nombre entier' })
  @Min(0, { message: 'Seuil d’alerte : 0 au moins' })
  @Max(10_000, { message: 'Seuil d’alerte : 10 000 au plus' })
  seuilStockFaible?: number;

  /** Absent du site (faux si absent) */
  @IsOptional()
  @IsBoolean({ message: '« Masqué » doit valoir vrai ou faux' })
  masque?: boolean;
}

class VersionDto {
  /**
   * Version lue sur la fiche (`version` de la réponse)
   * @example 4
   */
  @IsInt({ message: 'Version du produit manquante : rechargez la fiche' })
  @Min(1, { message: 'Version du produit invalide : rechargez la fiche' })
  version: number;
}

/**
 * Modification complète d'un produit : même corps que l'ajout sans les photos (gérées par leurs
 * routes), plus la version lue
 */
export class UpdateProduitDto extends IntersectionType(
  OmitType(CreateProduitDto, ['photos'] as const),
  VersionDto,
) {}

/** Ajout d'une photo */
export class AddPhotoDto {
  /**
   * Image en data URL base64 (JPEG, PNG ou WebP ; 600 Ko maximum une fois décodée)
   * @example "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ…"
   */
  @IsString({ message: 'La photo doit être une data URL' })
  // Taille encodée en base64 + en-tête : coupe court avant le décodage
  @MaxLength(PHOTO_DATA_URL_MAX_LENGTH, {
    message: `Photo trop lourde : ${MAX_PHOTO_BYTES / 1024} Ko maximum`,
  })
  image: string;
}

// ───────────── Filtres ─────────────

export const TRIS_BOUTIQUE = ['defaut', 'prix-asc', 'prix-desc'] as const;
export const TRIS_ADMIN = [
  'defaut',
  'nom',
  'prix-asc',
  'prix-desc',
  'recent',
  'stock',
] as const;
export const VISIBILITES = ['visibles', 'masques'] as const;

class PageQueryDto {
  /**
   * Catégorie (identifiant)
   * @example "vernis"
   */
  @IsOptional()
  @IsString({ message: 'Catégorie : un identifiant' })
  @MaxLength(80, { message: 'Identifiant de catégorie trop long' })
  categorie?: string;

  /**
   * Recherche dans le nom (accents, majuscules et espaces ignorés)
   * @example "nude"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La recherche doit être un texte' })
  @MaxLength(80, { message: 'Recherche : 80 caractères au plus' })
  q?: string;

  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page : un nombre entier à partir de 1' })
  @Min(1, { message: 'Page : un nombre entier à partir de 1' })
  @Max(10_000, { message: 'Page : 10 000 au plus' })
  page: number = 1;
}

/** Filtres de la boutique (mêmes choix que la page /boutique) */
export class ProduitsPublicsQueryDto extends PageQueryDto {
  /** Ordre : catalogue (défaut), prix croissant ou décroissant */
  @ApiProperty({ enum: TRIS_BOUTIQUE, required: false, default: 'defaut' })
  @IsOptional()
  @IsIn(TRIS_BOUTIQUE, { message: `Tri inconnu : ${TRIS_BOUTIQUE.join(', ')}` })
  tri: (typeof TRIS_BOUTIQUE)[number] = 'defaut';

  /** Produits par page (1 à 48) @example 24 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Produits par page : entre 1 et 48' })
  @Min(1, { message: 'Produits par page : entre 1 et 48' })
  @Max(48, { message: 'Produits par page : entre 1 et 48' })
  parPage: number = 24;

  /**
   * Produit à exclure (produits associés d'une fiche)
   * @example "vernis-nude-rose-3f2a9c"
   */
  @IsOptional()
  @IsString({ message: 'Produit à exclure : un identifiant' })
  @MaxLength(100, { message: 'Identifiant de produit trop long' })
  sauf?: string;
}

/** Filtres de l'écran Boutique › Produits */
export class ProduitsAdminQueryDto extends PageQueryDto {
  @ApiProperty({ enum: NIVEAUX_STOCK, required: false })
  @IsOptional()
  @IsIn(NIVEAUX_STOCK, { message: 'Niveau de stock : ok, faible ou epuise' })
  stock?: NiveauStock;

  @ApiProperty({ enum: VISIBILITES, required: false })
  @IsOptional()
  @IsIn(VISIBILITES, { message: 'Visibilité : visibles ou masques' })
  visibilite?: (typeof VISIBILITES)[number];

  @ApiProperty({ enum: TRIS_ADMIN, required: false, default: 'defaut' })
  @IsOptional()
  @IsIn(TRIS_ADMIN, { message: `Tri inconnu : ${TRIS_ADMIN.join(', ')}` })
  tri: (typeof TRIS_ADMIN)[number] = 'defaut';

  /** Produits par page (1 à 100) @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Produits par page : entre 1 et 100' })
  @Min(1, { message: 'Produits par page : entre 1 et 100' })
  @Max(100, { message: 'Produits par page : entre 1 et 100' })
  parPage: number = 20;
}
