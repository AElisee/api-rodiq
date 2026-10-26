// Deux sessions indépendantes : une cliente et l'admin peuvent être connectées dans le même navigateur
export type SessionKind = 'client' | 'admin';

export const SESSION_COOKIES: Record<SessionKind, string> = {
  client: 'rodiq_session',
  admin: 'rodiq_admin_session',
};

const HOUR = 60 * 60 * 1000;

// Durée d'inactivité au-delà de laquelle la session est fermée
export const SESSION_IDLE_TIMEOUT_MS: Record<SessionKind, number> = {
  client: 30 * 24 * HOUR,
  admin: 8 * HOUR,
};

// La date de dernière activité n'est réécrite en base qu'au plus une fois par minute
export const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;
