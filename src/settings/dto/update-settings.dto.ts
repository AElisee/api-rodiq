import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../common/transforms';
import {
  BookingRulesDto,
  DayHoursDto,
  GeoPointDto,
  PlatformInfoDto,
  SalonDto,
  ShippingDto,
} from './settings.dto';

// Corps des requêtes admin : la création, puis un par onglet de l'écran Réglages

export const SLOT_DURATIONS = [30, 45, 60, 90, 120, 150, 180];

/** Onglet « Horaires et créneaux » */
export class UpdateHoursDto {
  /** 7 jours : index 0 = dimanche … 6 = samedi */
  @IsArray()
  @ArrayMinSize(7, { message: 'Indiquez les horaires des 7 jours' })
  @ArrayMaxSize(7, { message: 'Indiquez les horaires des 7 jours' })
  @ValidateNested({ each: true })
  @Type(() => DayHoursDto)
  semaine: DayHoursDto[];

  /**
   * Durée d'un créneau, en minutes : 30, 45, 60, 90, 120, 150 ou 180
   * @example 120
   */
  @IsIn(SLOT_DURATIONS, { message: 'Durée de créneau non proposée' })
  dureeCreneauMinutes: number;

  /**
   * Places par créneau (1 à 20), null = illimitées
   * @example 2
   */
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: 'Places par créneau : entre 1 et 20' })
  @Min(1, { message: 'Places par créneau : entre 1 et 20' })
  @Max(20, { message: 'Places par créneau : entre 1 et 20' })
  placesParCreneau: number | null;
}

/** Onglet « Fermetures » : ajout d'une fermeture (remplace celle du même jour) */
export class AddClosedDateDto {
  /**
   * Jour fermé (aujourd'hui ou plus tard)
   * @example "2026-12-25"
   */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'Date invalide (AAAA-MM-JJ)' })
  date: string;

  /**
   * Motif affiché (par défaut « Fermeture exceptionnelle »)
   * @example "Noël"
   */
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  motif?: string;
}

/** Onglet « Salon et position » */
export class UpdateSalonDto extends SalonDto {
  @ValidateNested()
  @Type(() => GeoPointDto)
  position: GeoPointDto;
}

/**
 * Première configuration : mêmes champs que la lecture des réglages, sans les logos
 * ni les fermetures (ajoutés ensuite depuis leurs onglets)
 */
export class CreateSettingsDto extends UpdateHoursDto {
  @ValidateNested()
  @Type(() => BookingRulesDto)
  regles: BookingRulesDto;

  @ValidateNested()
  @Type(() => PlatformInfoDto)
  plateforme: PlatformInfoDto;

  @ValidateNested()
  @Type(() => SalonDto)
  salon: SalonDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  position: GeoPointDto;

  /** Listes vides acceptées : à compléter plus tard */
  @ValidateNested()
  @Type(() => ShippingDto)
  livraisons: ShippingDto;
}

/** Onglet « Plateforme » : import d'un logo */
export class UpdateLogoDto {
  /**
   * Image en data URL base64 (SVG, PNG, WebP ou JPEG), 500 Ko maximum
   * @example "data:image/png;base64,iVBORw0KGgo…"
   */
  @IsString()
  // ~500 Ko encodés en base64, plus l'en-tête : coupe court avant le contrôle du format
  @MaxLength(700_000, { message: 'Image trop lourde : 500 Ko maximum' })
  @Matches(
    /^data:image\/(svg\+xml|png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/,
    {
      message: 'Image invalide : SVG, PNG, WebP ou JPEG en data URL base64',
    },
  )
  image: string;
}
