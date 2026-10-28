import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MODES_REMISE,
  type ModeRemise,
  STATUTS as STATUTS_COMMANDE,
  type Statut as StatutCommande,
} from '../../commandes/commandes.rules';
import { trim } from '../../common/transforms';
import {
  STATUTS as STATUTS_RESERVATION,
  type Statut as StatutReservation,
} from '../../reservations/reservations.rules';

// Écran Clientèle de l'admin : comptes clients et leur activité

/** Compte client avec son activité */
export class CompteClientDto {
  /** @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f" */
  id: string;

  /** @example "Aïcha" */
  prenom: string;

  /** @example "Koné" */
  nom: string;

  /** @example "+225 07 00 00 00 00" */
  telephone: string;

  /**
   * null si non renseigné
   * @example "+225 05 00 00 00 00"
   */
  whatsapp: string | null;

  /** @example "aicha.kone@exemple.ci" */
  email: string;

  /** Date d'inscription (ISO 8601) */
  creeLe: Date;

  /**
   * Réservations de tous statuts
   * @example 4
   */
  nombreReservations: number;

  /**
   * Date de la réservation la plus récente (tous statuts, à venir comprise), null si aucune
   * @example "2026-11-03"
   */
  dernierRendezVous: string | null;

  /**
   * Commandes de tous statuts
   * @example 2
   */
  nombreCommandes: number;

  /**
   * Francs CFA : soins terminés (prix de la carte à la réservation, les prix « dès … » comptés au minimum)
   * et commandes remises (frais de livraison compris)
   * @example 27500
   */
  depensesEstimees: number;
}

/** Réservation dans l'historique d'un compte */
export class ReservationCompteDto {
  /** @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f" */
  id: string;

  /** @example "RDQ-H9XC3B" */
  reference: string;

  /** @example "2026-11-03" */
  date: string;

  /** @example "09:00" */
  debut: string;

  /** @example "11:00" */
  fin: string;

  @ApiProperty({ enum: STATUTS_RESERVATION, example: 'terminee' })
  statut: StatutReservation;

  /**
   * Montant estimé en francs CFA
   * @example 9000
   */
  total: number;

  /** Au moins une prestation a un prix d'appel : le total est un minimum */
  totalAPartirDe: boolean;
}

/** Commande dans l'historique d'un compte */
export class CommandeCompteDto {
  /** @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f" */
  id: string;

  /** @example "CMD-7KQ2MZ" */
  reference: string;

  /** Date de la commande (ISO 8601) */
  creeLe: Date;

  @ApiProperty({ enum: STATUTS_COMMANDE, example: 'livree' })
  statut: StatutCommande;

  /** Le libellé du statut en dépend (« Prête au retrait » / « En livraison ») */
  @ApiProperty({ enum: MODES_REMISE, example: 'livraison' })
  mode: ModeRemise;

  /** @example true */
  payee: boolean;

  /**
   * Nombre d'articles (somme des quantités)
   * @example 3
   */
  nombreArticles: number;

  /**
   * Francs CFA, frais de livraison compris
   * @example 18500
   */
  total: number;
}

/** Fiche d'un compte : activité et historique complet, du plus récent au plus ancien */
export class CompteClientDetailDto extends CompteClientDto {
  reservations: ReservationCompteDto[];

  commandes: CommandeCompteDto[];
}

export class ComptesPageDto {
  elements: CompteClientDto[];

  /**
   * Nombre de comptes correspondant à la recherche
   * @example 42
   */
  total: number;

  /** @example 1 */
  page: number;

  /** @example 20 */
  parPage: number;
}

export const TRIS = [
  'recentes',
  'nom',
  'reservations',
  'commandes',
  'depenses',
] as const;
export type Tri = (typeof TRIS)[number];

/** Recherche, tri et pagination de l'écran Clientèle */
export class ComptesQueryDto {
  /**
   * Recherche dans le nom, les téléphones et l'e-mail (accents, majuscules et espaces ignorés)
   * @example "kone"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La recherche doit être un texte' })
  @MaxLength(100, { message: 'Recherche : 100 caractères au plus' })
  q?: string;

  /** Ordre : inscriptions récentes (défaut), nom, nombre de réservations, de commandes ou dépenses */
  @ApiProperty({ enum: TRIS, required: false, default: 'recentes' })
  @IsOptional()
  @IsIn(TRIS, { message: `Tri inconnu : ${TRIS.join(', ')}` })
  tri: Tri = 'recentes';

  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page : un nombre entier à partir de 1' })
  @Min(1, { message: 'Page : un nombre entier à partir de 1' })
  page: number = 1;

  /** Comptes par page (1 à 100) @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Comptes par page : entre 1 et 100' })
  @Min(1, { message: 'Comptes par page : entre 1 et 100' })
  @Max(100, { message: 'Comptes par page : entre 1 et 100' })
  parPage: number = 20;
}
