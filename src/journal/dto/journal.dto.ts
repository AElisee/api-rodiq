import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trim } from '../../common/transforms';
import {
  ACTEURS,
  CATEGORIES,
  RESULTATS,
  TYPES_CIBLE,
  type Categorie,
  type Resultat,
  type TypeActeur,
} from '../journal.rules';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Auteur de l'action, tel qu'il était au moment de l'action */
export class ActeurJournalDto {
  @ApiProperty({ enum: ACTEURS, example: 'admin' })
  type: TypeActeur;

  /**
   * Compte client ou admin ; null pour une personne non connectée
   * @example "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
   */
  id: string | null;

  /**
   * « Prénom Nom » d'un client, e-mail de l'admin, ou e-mail saisi lors d'une connexion refusée
   * @example "admin@rodiq.ci"
   */
  nom: string | null;
}

/** Élément touché par l'action */
export class CibleJournalDto {
  @ApiProperty({ enum: TYPES_CIBLE, example: 'reservation' })
  type: string;

  /**
   * Identifiant de l'élément (pour ouvrir sa fiche), null si sans objet
   * @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f"
   */
  id: string | null;

  /**
   * Nom au moment de l'action : référence, nom du produit, onglet des réglages…
   * @example "RDQ-H9XC3B"
   */
  libelle: string | null;
}

export class EvenementJournalDto {
  /** @example 1284 */
  id: number;

  /** Date de l'action (ISO 8601, à la milliseconde) */
  le: Date;

  @ApiProperty({ enum: CATEGORIES, example: 'reservation' })
  categorie: Categorie;

  /**
   * Code de l'action
   * @example "reservation.refusee"
   */
  action: string;

  /**
   * Libellé lisible de l'action
   * @example "Réservation refusée"
   */
  libelle: string;

  /** `echec` : tentative de connexion refusée */
  @ApiProperty({ enum: RESULTATS, example: 'succes' })
  resultat: Resultat;

  acteur: ActeurJournalDto;

  /** null pour une action sans élément précis */
  cible: CibleJournalDto | null;

  /**
   * Précision : motif, raison du refus…
   * @example "Le salon est fermé ce jour-là"
   */
  detail: string | null;

  /**
   * Adresse IP de la requête
   * @example "41.202.219.12"
   */
  ip: string | null;

  /**
   * User-Agent du navigateur
   * @example "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36"
   */
  navigateur: string | null;
}

/** Un jour ayant des entrées */
export class JourJournalDto {
  /**
   * Jour, à l'heure d'Abidjan
   * @example "2026-10-28"
   */
  jour: string;

  /**
   * Entrées ce jour-là avec les filtres
   * @example 42
   */
  nombre: number;
}

export class JournalPageDto {
  elements: EvenementJournalDto[];

  /**
   * Entrées correspondant aux filtres
   * @example 312
   */
  total: number;

  /** @example 1 */
  page: number;

  /** @example 20 */
  parPage: number;

  /** Entrées de chaque catégorie avec les autres filtres (pour les compteurs de l'écran) */
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    example: {
      connexion: 120,
      reservation: 96,
      commande: 54,
      boutique: 23,
      prestation: 11,
      reglage: 8,
    },
  })
  parCategorie: Record<Categorie, number>;

  /**
   * Jours ayant des entrées avec les filtres (sans `jour`), du plus récent au plus ancien : une page
   * d'écran par jour
   */
  jours: JourJournalDto[];
}

/** Filtres et pagination du journal, du plus récent au plus ancien */
export class JournalQueryDto {
  @ApiProperty({ enum: CATEGORIES, required: false })
  @IsOptional()
  @IsIn(CATEGORIES, {
    message: `Catégorie inconnue : ${CATEGORIES.join(', ')}`,
  })
  categorie?: Categorie;

  /** Auteur : client(e)s, admin ou personnes non connectées */
  @ApiProperty({ enum: ACTEURS, required: false })
  @IsOptional()
  @IsIn(ACTEURS, { message: `Auteur inconnu : ${ACTEURS.join(', ')}` })
  acteur?: TypeActeur;

  /** `echec` : seulement les connexions refusées */
  @ApiProperty({ enum: RESULTATS, required: false })
  @IsOptional()
  @IsIn(RESULTATS, { message: `Résultat inconnu : ${RESULTATS.join(', ')}` })
  resultat?: Resultat;

  /**
   * Premier jour (compris), heure d'Abidjan
   * @example "2026-10-01"
   */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'du : date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'du : date invalide (AAAA-MM-JJ)' })
  du?: string;

  /**
   * Dernier jour (compris), heure d'Abidjan
   * @example "2026-10-28"
   */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'au : date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'au : date invalide (AAAA-MM-JJ)' })
  au?: string;

  /**
   * Seulement les entrées de ce jour (heure d'Abidjan), compris dans la période `du`–`au`. Ne change
   * ni `parCategorie` ni `jours`
   * @example "2026-10-28"
   */
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'jour : date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'jour : date invalide (AAAA-MM-JJ)' })
  jour?: string;

  /**
   * Recherche dans l'auteur, l'élément, l'action, la précision et l'IP (accents, majuscules et espaces ignorés)
   * @example "RDQ-H9XC3B"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La recherche doit être un texte' })
  @MaxLength(100, { message: 'Recherche : 100 caractères au plus' })
  q?: string;

  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page : un nombre entier à partir de 1' })
  @Min(1, { message: 'Page : un nombre entier à partir de 1' })
  page: number = 1;

  /** Entrées par page (1 à 100) @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Entrées par page : entre 1 et 100' })
  @Min(1, { message: 'Entrées par page : entre 1 et 100' })
  @Max(100, { message: 'Entrées par page : entre 1 et 100' })
  parPage: number = 20;
}
