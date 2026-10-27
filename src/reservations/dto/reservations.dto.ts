import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/transforms';
import { TIME_MESSAGE, TIME_PATTERN } from '../../settings/dto/settings.dto';
import {
  CANAUX_CONTACT,
  type CanalContact,
  STATUTS,
  type Statut,
} from '../reservations.rules';

// Réservations : réponses et corps des requêtes
// (même structure que `Reservation` de `lib/reservations.ts` du front, noms en français)

/** Créneau de la fenêtre de réservation */
export class CreneauDto {
  /** @example "2026-11-03" */
  date: string;

  /** @example "09:00" */
  debut: string;

  /** @example "11:00" */
  fin: string;

  /**
   * Places encore libres (0 = complet), null = places illimitées
   * @example 1
   */
  placesRestantes: number | null;
}

/** Prestation figée au moment de la réservation (la carte peut changer ensuite) */
export class LigneReservationDto {
  /** @example "pose-mains-3f2a" */
  prestationId: string;

  /** @example "Pose mains" */
  nom: string;

  /**
   * Prix en francs CFA au moment de la réservation
   * @example 3000
   */
  prix: number;

  /** Prix d'appel, affiché « dès … » */
  prixAPartirDe: boolean;
}

/** Coordonnées de la cliente, copiées de son compte à la réservation */
export class ContactReservationDto {
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
}

export class ReservationDto {
  /** @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f" */
  id: string;

  /**
   * Référence courte communiquée à la cliente
   * @example "RDQ-H9XC3B"
   */
  reference: string;

  /** @example "2026-11-03" */
  date: string;

  /** @example "09:00" */
  debut: string;

  /** @example "11:00" */
  fin: string;

  @ApiProperty({ enum: STATUTS, example: 'en_attente' })
  statut: Statut;

  lignes: LigneReservationDto[];

  /**
   * Montant estimé en francs CFA (somme des lignes)
   * @example 9000
   */
  total: number;

  /** Au moins une ligne a un prix d'appel : le total est un minimum */
  totalAPartirDe: boolean;

  contact: ContactReservationDto;

  @ApiProperty({ enum: CANAUX_CONTACT, example: 'whatsapp' })
  canalContact: CanalContact;

  /** Note de la cliente (chaîne vide si aucune) */
  note: string;

  /**
   * Motif du refus, affiché à la cliente (null sauf statut `refusee`)
   * @example null
   */
  motifRefus: string | null;

  /**
   * Motif donné par la cliente à l'annulation (null si aucun)
   * @example null
   */
  motifAnnulation: string | null;

  /** Date de la demande (ISO 8601) */
  creeLe: Date;

  /** Dernier changement de statut (ISO 8601), null tant que la demande n'est pas traitée */
  traiteeLe: Date | null;
}

/** Réservation vue par la cliente */
export class ReservationClienteDto extends ReservationDto {
  /** La cliente peut encore l'annuler en ligne */
  annulable: boolean;

  /**
   * Dernier jour (inclus) où l'annulation en ligne est possible
   * @example "2026-11-01"
   */
  dateLimiteAnnulation: string;
}

/** Réservation vue par l'admin */
export class ReservationAdminDto extends ReservationDto {
  /** Compte de la cliente */
  compteId: string;
}

export class ReservationsPageDto {
  elements: ReservationAdminDto[];

  /**
   * Nombre total de réservations correspondant aux filtres
   * @example 42
   */
  total: number;

  /** @example 1 */
  page: number;

  /** @example 20 */
  parPage: number;

  /**
   * Nombre de réservations par statut avec les mêmes filtres, hors filtre de statut
   * @example { "en_attente": 4, "confirmee": 12, "refusee": 1, "annulee": 2, "terminee": 23 }
   */
  @ApiProperty({
    type: 'object',
    properties: Object.fromEntries(
      STATUTS.map((s) => [s, { type: 'integer' }]),
    ),
  })
  parStatut: Record<Statut, number>;
}

/** Demande de réservation : l'identité vient du compte connecté, les prix de la carte */
export class CreateReservationDto {
  /**
   * Prestations choisies (1 à 10, chacune une fois)
   * @example ["pose-mains-3f2a", "vernis-permanent-pieds-9b1c"]
   */
  @IsArray({ message: 'Choisissez au moins une prestation' })
  @ArrayMinSize(1, { message: 'Choisissez au moins une prestation' })
  @ArrayMaxSize(10, { message: '10 prestations au plus par réservation' })
  @ArrayUnique({ message: 'Une même prestation est choisie plusieurs fois' })
  @IsString({
    each: true,
    message: 'Chaque prestation doit être désignée par son identifiant',
  })
  @MaxLength(100, {
    each: true,
    message: 'Identifiant de prestation trop long',
  })
  prestationIds: string[];

  /** @example "2026-11-03" */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'Date invalide (AAAA-MM-JJ)' })
  date: string;

  /**
   * Début du créneau, tel que renvoyé par `GET /creneaux`
   * @example "09:00"
   */
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  debut: string;

  /** Moyen par lequel le salon recontacte la cliente */
  @ApiProperty({ enum: CANAUX_CONTACT, example: 'whatsapp' })
  @IsIn(CANAUX_CONTACT, {
    message: 'Moyen de contact : appel, whatsapp, sms ou email',
  })
  canalContact: CanalContact;

  /**
   * Précision pour le salon, vide ou absente si aucune
   * @example "Ongles abîmés sur la main gauche"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La note doit être un texte' })
  @MaxLength(500, { message: 'Note : 500 caractères au plus' })
  note?: string;
}

/** Annulation par la cliente */
export class CancelReservationDto {
  /**
   * Motif transmis au salon, facultatif
   * @example "Empêchement professionnel"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'Le motif doit être un texte' })
  @MaxLength(500, { message: 'Motif : 500 caractères au plus' })
  motif?: string;
}

/** Refus par l'admin : le motif est affiché à la cliente */
export class RejectReservationDto {
  /** @example "Le salon est complet ce jour-là : merci de choisir un autre créneau." */
  @Transform(trim)
  @IsString({ message: 'Indiquez le motif du refus' })
  @MinLength(5, { message: 'Motif du refus : 5 caractères au moins' })
  @MaxLength(500, { message: 'Motif du refus : 500 caractères au plus' })
  motif: string;
}

export const QUAND = ['a-venir', 'passees'] as const;
export const TRIS = ['date-asc', 'date-desc', 'demande', 'nom'] as const;

/** Filtres de la liste admin (mêmes choix que l'écran Réservations) */
export class ReservationsQueryDto {
  @ApiProperty({ enum: STATUTS, required: false })
  @IsOptional()
  @IsIn(STATUTS, {
    message: `Statut inconnu : ${STATUTS.join(', ')}`,
  })
  statut?: Statut;

  /** Rendez-vous à venir (aujourd'hui compris) ou passés ; toutes les dates si absent */
  @ApiProperty({ enum: QUAND, required: false })
  @IsOptional()
  @IsIn(QUAND, { message: 'Période : a-venir ou passees' })
  quand?: (typeof QUAND)[number];

  /**
   * Recherche dans le nom, les téléphones, l'e-mail et la référence (accents, majuscules et espaces ignorés)
   * @example "kone"
   */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La recherche doit être un texte' })
  @MaxLength(100, { message: 'Recherche : 100 caractères au plus' })
  q?: string;

  /** Ordre : rendez-vous les plus proches (défaut), les plus récents, demandes récentes ou nom */
  @ApiProperty({ enum: TRIS, required: false, default: 'date-asc' })
  @IsOptional()
  @IsIn(TRIS, { message: `Tri inconnu : ${TRIS.join(', ')}` })
  tri: (typeof TRIS)[number] = 'date-asc';

  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page : un nombre entier à partir de 1' })
  @Min(1, { message: 'Page : un nombre entier à partir de 1' })
  page: number = 1;

  /** Réservations par page (1 à 100) @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Réservations par page : entre 1 et 100' })
  @Min(1, { message: 'Réservations par page : entre 1 et 100' })
  @Max(100, { message: 'Réservations par page : entre 1 et 100' })
  parPage: number = 20;
}
