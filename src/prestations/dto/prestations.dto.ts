import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/transforms';

// Carte des prestations : réponses et corps des requêtes admin
// (même structure que `PrestationCategory` / `Prestation` de `lib/prestations.ts` du front, noms en français)

/** Prestation de la carte */
export class PrestationDto {
  /** @example "pose-mains-3f2a" */
  id: string;

  /** @example "Pose mains" */
  nom: string;

  /**
   * Prix en francs CFA
   * @example 3000
   */
  prix: number;

  /** Prix d'appel, affiché « dès … » */
  prixAPartirDe: boolean;

  /**
   * Précision affichée sous le nom (chaîne vide si aucune)
   * @example "Mèches incluses"
   */
  precision: string;
}

/** Catégorie, avec ses prestations dans l'ordre d'affichage */
export class PrestationCategoryDto {
  /**
   * Slug tiré du nom à la création, conservé ensuite (ancre de la page /prestations)
   * @example "mains"
   */
  id: string;

  /** @example "Mains" */
  nom: string;

  /**
   * Accroche (chaîne vide si aucune)
   * @example "Manucure & beauté des ongles"
   */
  accroche: string;

  prestations: PrestationDto[];
}

/** Ajout ou modification d'une catégorie */
export class SavePrestationCategoryDto {
  /**
   * Nom unique (casse et accents ignorés)
   * @example "Mains"
   */
  @Transform(trim)
  @IsString({ message: 'Le nom de la catégorie doit être un texte' })
  @MinLength(2, { message: 'Nom de la catégorie : 2 caractères au moins' })
  @MaxLength(60, { message: 'Nom de la catégorie : 60 caractères au plus' })
  nom: string;

  /**
   * Accroche, vide ou absente si aucune
   * @example "Manucure & beauté des ongles"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'L’accroche doit être un texte' })
  @MaxLength(120, { message: 'Accroche : 120 caractères au plus' })
  accroche?: string;
}

/** Ajout ou modification d'une prestation */
export class SavePrestationDto {
  /**
   * Catégorie de la prestation ; en changer place la prestation en fin de la nouvelle catégorie
   * @example "mains"
   */
  @IsString({ message: 'Indiquez la catégorie de la prestation' })
  @MaxLength(80, { message: 'Identifiant de catégorie trop long' })
  categorieId: string;

  /** @example "Pose mains" */
  @Transform(trim)
  @IsString({ message: 'Le nom de la prestation doit être un texte' })
  @MinLength(2, { message: 'Nom de la prestation : 2 caractères au moins' })
  @MaxLength(80, { message: 'Nom de la prestation : 80 caractères au plus' })
  nom: string;

  /**
   * Prix en francs CFA (entier, plus de 0)
   * @example 3000
   */
  @IsInt({ message: 'Prix : un nombre entier de FCFA, sans décimales' })
  @Min(1, { message: 'Prix : 1 FCFA au moins' })
  @Max(10_000_000, { message: 'Prix : 10 000 000 FCFA au plus' })
  prix: number;

  /** Prix d'appel, affiché « dès … » (faux si absent) */
  @IsOptional()
  @IsBoolean({ message: '« Prix d’appel » doit valoir vrai ou faux' })
  prixAPartirDe?: boolean;

  /**
   * Précision, vide ou absente si aucune
   * @example "Mains et pieds"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La précision doit être un texte' })
  @MaxLength(120, { message: 'Précision : 120 caractères au plus' })
  precision?: string;
}

/** Nouvel ordre d'affichage : chaque identifiant une fois, tous présents */
export class OrderDto {
  /** @example ["mains", "pieds", "mains-et-pieds", "beaute"] */
  @IsArray({ message: 'L’ordre doit être une liste d’identifiants' })
  @ArrayMaxSize(500, { message: 'L’ordre ne peut pas dépasser 500 éléments' })
  @IsString({ each: true, message: 'Chaque identifiant doit être un texte' })
  ids: string[];
}
