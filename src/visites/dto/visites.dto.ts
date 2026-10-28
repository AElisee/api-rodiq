import { IsISO8601, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class VisitesQueryDto {
  /**
   * Premier jour de la période (compris)
   * @example "2025-11-01"
   */
  @Matches(DATE_PATTERN, { message: 'du : date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'du : date invalide (AAAA-MM-JJ)' })
  du: string;

  /**
   * Dernier jour de la période (compris)
   * @example "2026-10-28"
   */
  @Matches(DATE_PATTERN, { message: 'au : date invalide (AAAA-MM-JJ)' })
  @IsISO8601({ strict: true }, { message: 'au : date invalide (AAAA-MM-JJ)' })
  au: string;
}

export class VisitesJourDto {
  /**
   * Jour, à l'heure d'Abidjan
   * @example "2026-10-28"
   */
  jour: string;

  /**
   * Visiteurs uniques ce jour-là
   * @example 37
   */
  visiteurs: number;
}
