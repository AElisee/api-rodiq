import { createHash } from 'node:crypto';
import { addDays } from '../reservations/reservations.rules';

// Plage maximale lue par le tableau de bord : 12 mois pleins plus le mois en cours
export const MAX_JOURS_PERIODE = 400;

// Robots, aperçus de liens et outils en ligne de commande : jamais comptés comme visiteurs
const ROBOT_PATTERN =
  /bot|crawl|spider|slurp|archiver|facebookexternalhit|whatsapp|telegram|preview|headless|lighthouse|pagespeed|curl|wget|python|java\/|okhttp|axios|node-fetch|undici|postman|insomnia/i;

/** Vrai si la requête ne vient pas d'une personne : User-Agent absent ou de robot */
export const estRobot = (userAgent: string | undefined) =>
  !userAgent?.trim() || ROBOT_PATTERN.test(userAgent);

/** Empreinte anonyme d'un visiteur pour la journée du sel */
export const empreinte = (sel: string, ip: string, userAgent: string) =>
  createHash('sha256').update(`${sel}\n${ip}\n${userAgent}`).digest('hex');

/** Écarts d'une période demandée (`du` et `au` compris), tous listés */
export const periodeErrors = (du: string, au: string) => {
  const errors: string[] = [];
  if (du > au) {
    errors.push(`La date de début (${du}) est après la date de fin (${au})`);
  } else if (addDays(du, MAX_JOURS_PERIODE - 1) < au) {
    errors.push(
      `Période trop longue : ${MAX_JOURS_PERIODE} jours au plus (du ${du} au ${au})`,
    );
  }
  return errors;
};
