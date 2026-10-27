import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  normalizeEmail,
  normalizePhone,
  PHONE_MESSAGE,
  PHONE_PATTERN,
  trim,
} from '../../common/transforms';

// Formes des réglages, communes aux réponses et aux corps des requêtes admin
// (même structure que `lib/stores/settings-store.ts` du front, noms de champs en français)

export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const TIME_MESSAGE = 'Heure invalide (HH:mm)';
const URL_PATTERN = /^https?:\/\/\S+\.\S+/;

// Une pause vide (« » ou null) équivaut à pas de pause
const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' || value === null ? undefined : value;

const IntBetween = (min: number, max: number, message: string) =>
  applyDecorators(
    IsInt({ message }),
    Min(min, { message }),
    Max(max, { message }),
  );

/** Règles de réservation et d'annulation */
export class BookingRulesDto {
  /**
   * Réservation ouverte sur les N prochains jours (1 à 365)
   * @example 30
   */
  @IntBetween(1, 365, 'Réservation ouverte : entre 1 et 365 jours')
  fenetreReservationJours: number;

  /**
   * Délai minimum, en heures, entre la réservation et le début du créneau (0 à 168)
   * @example 12
   */
  @IntBetween(0, 168, 'Délai minimum : entre 0 et 168 heures')
  delaiMinimumHeures: number;

  /**
   * Annulation en ligne possible jusqu'à N jours avant le rendez-vous (0 à 30)
   * @example 2
   */
  @IntBetween(0, 30, "Délai d'annulation : entre 0 et 30 jours")
  delaiAnnulationJours: number;
}

/** Horaires d'un jour de la semaine */
export class DayHoursDto {
  /**
   * Jour ouvert. Un jour fermé garde ses horaires, ignorés.
   * @example true
   */
  @IsBoolean()
  ouvert: boolean;

  /** @example "09:00" */
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  ouverture: string;

  /** @example "19:00" */
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  fermeture: string;

  /**
   * Début de la pause déjeuner, avec `finPause` (absent : pas de pause). Aucun créneau ne la chevauche.
   * @example "13:00"
   */
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  debutPause?: string;

  /** @example "14:00" */
  @Transform(emptyToUndefined)
  @IsOptional()
  @Matches(TIME_PATTERN, { message: TIME_MESSAGE })
  finPause?: string;
}

/** Fermeture exceptionnelle (congés, jour férié) : aucun créneau ce jour-là */
export class ClosedDateDto {
  /** @example "2026-12-25" */
  date: string;

  /** @example "Noël" */
  motif: string;
}

/** Liens des réseaux sociaux (chaîne vide : non affiché) */
export class SocialsDto {
  /** @example "https://instagram.com/rodiq" */
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @MaxLength(500)
  @Matches(URL_PATTERN, { message: 'Instagram : lien invalide (https://…)' })
  instagram: string;

  /** @example "https://facebook.com/rodiq" */
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @MaxLength(500)
  @Matches(URL_PATTERN, { message: 'Facebook : lien invalide (https://…)' })
  facebook: string;

  /** @example "https://tiktok.com/@rodiq" */
  @Transform(trim)
  @IsOptional()
  @ValidateIf((_, value) => value !== '')
  @MaxLength(500)
  @Matches(URL_PATTERN, { message: 'TikTok : lien invalide (https://…)' })
  tiktok: string;
}

/** Identité et contacts de la plateforme, affichés sur le site */
export class PlatformInfoDto {
  /** @example "Rodiq" */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Indiquez le nom de la plateforme' })
  @MaxLength(80)
  nom: string;

  /** @example "« Ne pas cacher. Prendre soin. »" */
  @Transform(trim)
  @IsString()
  @MaxLength(160)
  slogan: string;

  /** @example "contact@rodiq.com" */
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  @MaxLength(254)
  email: string;

  /**
   * Téléphone principal : 10 chiffres, avec ou sans « +225 ». Enregistré au format « +225 07 00 00 00 00 ».
   * @example "+225 07 00 00 00 00"
   */
  @Transform(normalizePhone)
  @IsString({ message: 'Indiquez un numéro' })
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  telephone: string;

  /**
   * Second téléphone (chaîne vide : aucun)
   * @example ""
   */
  @Transform(normalizePhone)
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  telephoneSecondaire: string;

  /**
   * Numéro WhatsApp (chaîne vide : aucun)
   * @example "+225 05 00 00 00 00"
   */
  @Transform(normalizePhone)
  @IsOptional()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  whatsapp: string;

  @ValidateNested()
  @Type(() => SocialsDto)
  reseauxSociaux: SocialsDto;
}

// Variantes du logo : « principal » sur fond clair, « clair » sur fond sombre, « icône » carrée
export const LOGO_VARIANTS = ['principal', 'clair', 'icone'] as const;
export type LogoVariant = (typeof LOGO_VARIANTS)[number];

/** Logos en data URL ; une variante absente n'a pas été importée */
export class LogosDto {
  /** Version foncée, sur fond clair @example "data:image/svg+xml;base64,PHN2Zy…" */
  principal?: string;

  /** Version claire, sur fond sombre */
  clair?: string;

  /** Format carré */
  icone?: string;
}

export class PlatformDto extends PlatformInfoDto {
  logos: LogosDto;
}

/** Position du salon (lien « Itinéraire ») */
export class GeoPointDto {
  /** @example 5.36 */
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'Latitude : entre -90 et 90' },
  )
  @Min(-90, { message: 'Latitude : entre -90 et 90' })
  @Max(90, { message: 'Latitude : entre -90 et 90' })
  latitude: number;

  /** @example -4.0083 */
  @IsNumber(
    { allowNaN: false, allowInfinity: false },
    { message: 'Longitude : entre -180 et 180' },
  )
  @Min(-180, { message: 'Longitude : entre -180 et 180' })
  @Max(180, { message: 'Longitude : entre -180 et 180' })
  longitude: number;
}

export class SalonDto {
  /** Adresse affichée dans le pied de page @example "Cocody Angré, 7e tranche" */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: "Indiquez l'adresse du salon" })
  @MaxLength(255)
  adresse: string;
}

/** Tarif de livraison ou d'expédition vers une destination */
export class ShippingRateDto {
  /** Commune ou ville @example "Cocody" */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Indiquez la destination' })
  @MaxLength(80)
  destination: string;

  /** Frais en francs CFA @example 2000 */
  @IntBetween(0, 1_000_000, 'Indiquez un montant valide')
  frais: number;
}

/** Livraison à domicile dans Abidjan et expédition vers les autres villes */
export class ShippingDto {
  /** Communes livrées à domicile (noms uniques) */
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShippingRateDto)
  domicile: ShippingRateDto[];

  /** Villes desservies par expédition (noms uniques) */
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ShippingRateDto)
  expedition: ShippingRateDto[];
}

/** Tous les réglages du salon, lus par le site */
export class SettingsDto {
  regles: BookingRulesDto;

  /** 7 jours : index 0 = dimanche … 6 = samedi (comme `Date.getDay()`) */
  semaine: DayHoursDto[];

  /**
   * Durée d'un créneau, en minutes
   * @example 120
   */
  dureeCreneauMinutes: number;

  /**
   * Places par créneau, null = illimitées
   * @example 2
   */
  placesParCreneau: number | null;

  /** Fermetures exceptionnelles à venir (aujourd'hui compris), par date croissante */
  fermetures: ClosedDateDto[];

  plateforme: PlatformDto;
  salon: SalonDto;
  position: GeoPointDto;
  livraisons: ShippingDto;
}
