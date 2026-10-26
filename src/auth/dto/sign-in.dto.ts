import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from './transforms';

export class SignInDto {
  /**
   * Adresse e-mail du compte (casse et espaces ignorés)
   * @example "aicha.kone@exemple.ci"
   */
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  @MaxLength(254)
  email: string;

  /**
   * Mot de passe
   * @example "rodiq2026"
   */
  @IsString()
  @MinLength(1, { message: 'Indiquez votre mot de passe' })
  @MaxLength(128)
  password: string;
}
