import type { DayHoursDto, ShippingRateDto } from './dto/settings.dto';

// Règles vérifiées par l'écran Réglages du front, revérifiées ici

const WEEKDAY_NAMES = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

// Même contrôle que `dayError` de l'écran Réglages (les heures HH:mm se comparent comme du texte)
const dayError = (day: DayHoursDto) => {
  if (!day.ouvert) return undefined;
  if (day.fermeture <= day.ouverture)
    return "la fermeture doit être après l'ouverture";
  if (day.debutPause || day.finPause) {
    if (!day.debutPause || !day.finPause)
      return 'indiquez le début et la fin de la pause';
    if (day.finPause <= day.debutPause)
      return 'la fin de la pause doit être après son début';
    if (day.debutPause < day.ouverture || day.finPause > day.fermeture)
      return "la pause doit être pendant les heures d'ouverture";
  }
  return undefined;
};

/** Erreurs des horaires de la semaine, préfixées du nom du jour */
export const weekErrors = (semaine: DayHoursDto[]) =>
  semaine.flatMap((day, i) => {
    const error = dayError(day);
    return error ? [`${WEEKDAY_NAMES[i]} : ${error}`] : [];
  });

/** Destinations en double dans une liste de tarifs (casse ignorée) */
export const duplicatePlaces = (rates: ShippingRateDto[]) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { destination } of rates) {
    const key = destination.toLowerCase();
    if (seen.has(key)) duplicates.add(destination);
    seen.add(key);
  }
  return [...duplicates];
};

export const MAX_LOGO_BYTES = 500 * 1024;

/** Taille décodée d'une data URL base64 */
export const dataUrlBytes = (dataUrl: string) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length * 3) / 4 - padding;
};

/** Date du jour du serveur au format yyyy-MM-dd */
export const todayKey = (now = new Date()) =>
  [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
