import type { Account } from '../entities/account.entity';

/** Compte client tel que renvoyé par l'API (sans mot de passe) */
export class AccountDto {
  /** @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f" */
  id: string;

  /** @example "Aïcha" */
  firstName: string;

  /** @example "Koné" */
  lastName: string;

  /** @example "+225 07 00 00 00 00" */
  phone: string;

  /**
   * Numéro WhatsApp, null s'il n'a pas été renseigné
   * @example "+225 05 00 00 00 00"
   */
  whatsapp: string | null;

  /** @example "aicha.kone@exemple.ci" */
  email: string;

  /**
   * Date de création du compte (ISO 8601)
   * @example "2026-10-26T21:00:00.000Z"
   */
  createdAt: Date;

  static from(account: Account): AccountDto {
    const { id, firstName, lastName, phone, whatsapp, email, createdAt } =
      account;
    return { id, firstName, lastName, phone, whatsapp, email, createdAt };
  }
}

/** Réponse de connexion / inscription : le compte et son jeton de session */
export class AccountSessionDto extends AccountDto {
  /**
   * Jeton de session, à envoyer dans `Authorization: Bearer <token>`.
   * Le même jeton est posé dans le cookie httpOnly `rodiq_session` : le front web n'a pas à le stocker.
   * @example "q8Zc1b7mN0r3T5vXyA2dF4gH6jK9pL1sW3eR5tY7uI0"
   */
  token: string;
}
