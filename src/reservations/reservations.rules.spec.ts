import type { DayHoursDto } from '../settings/dto/settings.dto';
import {
  bookableSlots,
  canCancel,
  daySlotTimes,
  escapeLike,
  findSlot,
  newReference,
  normalizeSearch,
  type Schedule,
  statusConflict,
} from './reservations.rules';

const weekday = (): DayHoursDto => ({
  ouvert: true,
  ouverture: '09:00',
  fermeture: '17:00',
  debutPause: '12:00',
  finPause: '13:00',
});

// Dimanche fermé, lundi à samedi 9 h – 17 h avec pause déjeuner, créneaux de 2 h
const schedule = (): Schedule => ({
  regles: {
    fenetreReservationJours: 7,
    delaiMinimumHeures: 12,
    delaiAnnulationJours: 2,
  },
  semaine: [
    { ouvert: false, ouverture: '09:00', fermeture: '17:00' },
    ...Array.from({ length: 6 }, weekday),
  ],
  dureeCreneauMinutes: 120,
});

// Lundi 2 novembre 2026, 8 h à Abidjan
const now = new Date('2026-11-02T08:00:00Z');

describe('règles des réservations', () => {
  it('découpe la journée en créneaux sans chevaucher la pause', () => {
    expect(daySlotTimes(weekday(), 120)).toEqual([
      { debut: '09:00', fin: '11:00' },
      { debut: '13:00', fin: '15:00' },
      { debut: '15:00', fin: '17:00' },
    ]);
  });

  it('propose les créneaux de la fenêtre, hors fermetures et délai minimum', () => {
    const slots = bookableSlots(schedule(), new Set(['2026-11-04']), now);
    // Lundi : seul 15 h commence plus de 12 h après 8 h ; mercredi fermé ; dimanche fermé
    expect(slots.filter((s) => s.date === '2026-11-02')).toEqual([]);
    expect(slots.filter((s) => s.date === '2026-11-03')).toHaveLength(3);
    expect(slots.some((s) => s.date === '2026-11-04')).toBe(false);
    expect(slots.some((s) => s.date === '2026-11-08')).toBe(false);
    expect(slots.at(-1)).toEqual({
      date: '2026-11-09',
      debut: '15:00',
      fin: '17:00',
    });
  });

  it('accepte un créneau réservable', () => {
    expect(findSlot(schedule(), null, '2026-11-03', '13:00', now)).toEqual({
      slot: { date: '2026-11-03', debut: '13:00', fin: '15:00' },
    });
  });

  it('explique pourquoi un créneau est refusé', () => {
    const error = (date: string, debut: string, closure = null) =>
      (findSlot(schedule(), closure, date, debut, now) as { error: string })
        .error;
    expect(error('2026-11-01', '09:00')).toBe(
      'Le dimanche 1 novembre 2026 est déjà passé',
    );
    expect(error('2026-11-10', '09:00')).toBe(
      'Les réservations sont ouvertes sur 7 jours : choisissez une date jusqu’au lundi 9 novembre 2026',
    );
    expect(
      (
        findSlot(
          schedule(),
          { motif: 'Toussaint' },
          '2026-11-03',
          '09:00',
          now,
        ) as { error: string }
      ).error,
    ).toBe('Le salon est fermé le mardi 3 novembre 2026 (Toussaint)');
    expect(error('2026-11-08', '09:00')).toBe('Le salon est fermé le dimanche');
    expect(error('2026-11-03', '11:00')).toBe(
      'Aucun créneau ne commence à 11:00 le mardi 3 novembre 2026',
    );
    expect(
      (
        findSlot(
          schedule(),
          null,
          '2026-11-02',
          '09:00',
          new Date('2026-11-02T10:00:00Z'),
        ) as { error: string }
      ).error,
    ).toBe('Le créneau de 09:00 le lundi 2 novembre 2026 est passé');
    expect(error('2026-11-02', '13:00')).toBe(
      'Ce créneau commence dans moins de 12 heures : réservez au moins 12 heures à l’avance',
    );
  });

  it('autorise l’annulation jusqu’au délai, pour une réservation active', () => {
    const r = { statut: 'confirmee' as const, date: '2026-11-04' };
    expect(canCancel(r, 2, now)).toBe(true);
    expect(canCancel(r, 2, new Date('2026-11-03T08:00:00Z'))).toBe(false);
    expect(canCancel({ ...r, statut: 'refusee' }, 2, now)).toBe(false);
  });

  it('génère des références sans caractères ambigus', () => {
    expect(newReference()).toMatch(/^RDQ-[A-HJ-NP-Z2-9]{6}$/);
  });

  it('normalise la recherche et échappe LIKE', () => {
    expect(normalizeSearch('Aïcha  Koné 07 00')).toBe('aichakone0700');
    expect(escapeLike('50%_a\\')).toBe('50\\%\\_a\\\\');
  });

  it('dit où en est une réservation refusée à la transition', () => {
    expect(statusConflict('RDQ-ABCDEF', 'annulee', 'confirmée')).toBe(
      'La réservation RDQ-ABCDEF a été annulée par la cliente : elle ne peut pas être confirmée',
    );
  });
});
