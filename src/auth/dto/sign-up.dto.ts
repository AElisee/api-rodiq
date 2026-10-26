import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail, normalizePhone, trim } from './transforms';

// Lettres (accents compris), espaces, tirets et apostrophes : N'Guessan, Marie-Laure
const NAME_PATTERN = /^\p{L}+(?:[\s'’-]\p{L}+)*$/u;
const PHONE_PATTERN = /^\+225( \d{2}){5}$/;
const PHONE_MESSAGE = 'Le numéro doit comporter 10 chiffres';

export class SignUpDto {
  /**
   * Prénom
   * @example "Aïcha"
   */
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Indiquez votre prénom' })
  @MaxLength(80)
  @Matches(NAME_PATTERN, { message: 'Entrer un prénom correct' })
  firstName: string;

  /**
   * Nom
   * @example "Koné"
   */
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Indiquez votre nom' })
  @MaxLength(80)
  @Matches(NAME_PATTERN, { message: 'Entrer un nom correct' })
  lastName: string;

  /**
   * Téléphone ivoirien : 10 chiffres, avec ou sans « +225 » et espaces.
   * Enregistré au format « +225 07 00 00 00 00 ».
   * @example "07 00 00 00 00"
   */
  @Transform(normalizePhone)
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone: string;

  /**
   * Numéro WhatsApp s'il diffère du téléphone (même format, facultatif)
   * @example "05 00 00 00 00"
   */
  @Transform(normalizePhone)
  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  whatsapp?: string;

  /**
   * Adresse e-mail, unique par compte (casse et espaces ignorés)
   * @example "aicha.kone@exemple.ci"
   */
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  @MaxLength(254)
  email: string;

  /**
   * Mot de passe : 8 caractères au moins
   * @example "rodiq2026"
   */
  @IsString()
  @MinLength(8, { message: 'Au moins 8 caractères' })
  @MaxLength(128)
  password: string;
}
