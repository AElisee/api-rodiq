import { randomInt } from 'node:crypto';
import type { DayHoursDto } from '../settings/dto/settings.dto';
import type { Settings } from '../settings/entities/settings.entity';

// Règles vérifiées par les écrans Réservation du front (`lib/reservations.ts`), revérifiées ici.
// Le salon est à Abidjan (UTC+0, sans heure d'été) : dates et heures se calculent en UTC,
// quel que soit le fuseau du serveur

// Cycle de vie :
// en_attente → confirmee → terminee
// en_attente / confirmee (à venir) → refusee (motif obligatoire, côté admin)
// en_attente / confirmee → annulee (par la cliente, dans le délai autorisé)
export const STATUTS = [
  'en_attente',
  'confirmee',
  'refusee',
  'annulee',
  'terminee',
] as const;
export type Statut = (typeof STATUTS)[number];

// Une réservation active occupe une place sur son créneau
export const ACTIVE_STATUTS: Statut[] = ['en_attente', 'confirmee'];
export const isActive = (statut: Statut) => ACTIVE_STATUTS.includes(statut);

export const CANAUX_CONTACT = ['appel', 'whatsapp', 'sms', 'email'] as const;
export type CanalContact = (typeof CANAUX_CONTACT)[number];

// Réservations actives à venir par compte : empêche une cliente d'accaparer les créneaux
export const MAX_ACTIVE_RESERVATIONS = 3;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Jour (yyyy-MM-dd) d'un instant, à l'heure d'Abidjan */
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const dayStart = (key: string) => new Date(`${key}T00:00:00Z`);

export const addDays = (key: string, days: number) =>
  dayKey(new Date(dayStart(key).getTime() + days * DAY_MS));

/** Début d'un créneau, à l'heure d'Abidjan */
export const slotStart = (date: string, debut: string) =>
  new Date(`${date}T${debut}:00Z`);

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekdayFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  timeZone: 'UTC',
});

/** « lundi 3 novembre 2026 » */
export const formatDay = (key: string) => dayFormat.format(dayStart(key));

const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Créneaux d'une journée : de l'ouverture à la fermeture, par pas de `minutes`, hors pause
// (même calcul que `daySlotTimes` du front)
export const daySlotTimes = (day: DayHoursDto, minutes: number) => {
  if (!day.ouvert || minutes <= 0) return [];
  const closing = toMinutes(day.fermeture);
  const pause =
    day.debutPause && day.finPause
      ? { start: toMinutes(day.debutPause), end: toMinutes(day.finPause) }
      : null;
  const times: { debut: string; fin: string }[] = [];
  let start = toMinutes(day.ouverture);

  while (start + minutes <= closing) {
    // Le créneau chevaucherait la pause : on reprend à la fin de celle-ci
    if (pause && start < pause.end && start + minutes > pause.start) {
      start = Math.max(start, pause.end);
      continue;
    }
    times.push({ debut: toTime(start), fin: toTime(start + minutes) });
    start += minutes;
  }
  return times;
};

export type Schedule = Pick<
  Settings,
  'regles' | 'semaine' | 'dureeCreneauMinutes'
>;

export type Slot = { date: string; debut: string; fin: string };

const weekdaySlots = (schedule: Schedule, date: string) =>
  daySlotTimes(
    schedule.semaine[dayStart(date).getUTCDay()],
    schedule.dureeCreneauMinutes,
  );

const earliestStart = (schedule: Schedule, now: Date) =>
  now.getTime() + schedule.regles.delaiMinimumHeures * HOUR_MS;

// Créneaux réservables sur la fenêtre de réservation, hors jours fermés et délai minimum
// (même calcul que `getSlots` du front)
export const bookableSlots = (
  schedule: Schedule,
  closedDates: Set<string>,
  now = new Date(),
): Slot[] => {
  const today = dayKey(now);
  const earliest = earliestStart(schedule, now);
  return Array.from(
    { length: schedule.regles.fenetreReservationJours + 1 },
    (_, i) => addDays(today, i),
  )
    .filter((date) => !closedDates.has(date))
    .flatMap((date) =>
      weekdaySlots(schedule, date).map((time) => ({ date, ...time })),
    )
    .filter((slot) => slotStart(slot.date, slot.debut).getTime() > earliest);
};

const hours = (n: number) => `${n} heure${n > 1 ? 's' : ''}`;

/**
 * Créneau demandé par la cliente, ou la raison précise pour laquelle il n'est pas réservable.
 * `closure` : fermeture exceptionnelle de ce jour-là, s'il y en a une
 */
export const findSlot = (
  schedule: Schedule,
  closure: { motif: string } | null,
  date: string,
  debut: string,
  now = new Date(),
): { slot: Slot } | { error: string } => {
  const today = dayKey(now);
  const last = addDays(today, schedule.regles.fenetreReservationJours);
  if (date < today) return { error: `Le ${formatDay(date)} est déjà passé` };
  if (date > last) {
    return {
      error:
        `Les réservations sont ouvertes sur ${schedule.regles.fenetreReservationJours} jours : ` +
        `choisissez une date jusqu’au ${formatDay(last)}`,
    };
  }
  if (closure) {
    return {
      error: `Le salon est fermé le ${formatDay(date)} (${closure.motif})`,
    };
  }
  const times = weekdaySlots(schedule, date);
  if (!times.length) {
    return {
      error: `Le salon est fermé le ${weekdayFormat.format(dayStart(date))}`,
    };
  }
  const time = times.find((t) => t.debut === debut);
  if (!time) {
    return {
      error: `Aucun créneau ne commence à ${debut} le ${formatDay(date)}`,
    };
  }
  const start = slotStart(date, debut).getTime();
  if (start <= now.getTime()) {
    return { error: `Le créneau de ${debut} le ${formatDay(date)} est passé` };
  }
  if (start <= earliestStart(schedule, now)) {
    const notice = hours(schedule.regles.delaiMinimumHeures);
    return {
      error: `Ce créneau commence dans moins de ${notice} : réservez au moins ${notice} à l’avance`,
    };
  }
  return { slot: { date, ...time } };
};

/** Dernier jour (inclus) où la cliente peut annuler elle-même (comme `cancellationDeadline` du front) */
export const cancellationDeadline = (date: string, noticeDays: number) =>
  addDays(date, -noticeDays);

/** Annulation en ligne possible (comme `canCancel` du front) */
export const canCancel = (
  reservation: { statut: Statut; date: string },
  noticeDays: number,
  now = new Date(),
) =>
  isActive(reservation.statut) &&
  dayKey(now) <= cancellationDeadline(reservation.date, noticeDays);

// Référence courte communiquée à la cliente, sans caractères ambigus (0/O, 1/I)
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const newReference = () =>
  `RDQ-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('')}`;

/** Texte de recherche : sans accents, en minuscules et sans espaces (« 07 00 » trouve « +225 07 00 … ») */
export const normalizeSearch = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, '');

/** Échappe les jokers de LIKE pour chercher le texte tel quel */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

const STATUS_PHRASES: Record<Statut, string> = {
  en_attente: 'est en attente',
  confirmee: 'est déjà confirmée',
  refusee: 'a été refusée par le salon',
  annulee: 'a été annulée par la cliente',
  terminee: 'est déjà marquée terminée',
};

/** Refus d'une transition de statut : dit où en est la réservation */
export const statusConflict = (
  reference: string,
  statut: Statut,
  action: string,
) =>
  `La réservation ${reference} ${STATUS_PHRASES[statut]} : elle ne peut pas être ${action}`;
