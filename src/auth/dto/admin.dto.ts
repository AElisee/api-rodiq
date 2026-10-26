import type { Admin } from '../entities/admin.entity';

/** Admin connecté */
export class AdminDto {
  /** @example "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" */
  id: string;

  /** @example "admin@rodiq.ci" */
  email: string;

  static from({ id, email }: Admin): AdminDto {
    return { id, email };
  }
}

/** Réponse de connexion admin : l'admin et son jeton de session */
export class AdminSessionDto extends AdminDto {
  /**
   * Jeton de session, à envoyer dans `Authorization: Bearer <token>`.
   * Le même jeton est posé dans le cookie httpOnly `rodiq_admin_session`.
   * @example "q8Zc1b7mN0r3T5vXyA2dF4gH6jK9pL1sW3eR5tY7uI0"
   */
  token: string;
}
