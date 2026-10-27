import type { DayHoursDto } from './dto/settings.dto';
import {
  dataUrlBytes,
  duplicatePlaces,
  todayKey,
  weekErrors,
} from './settings.rules';

const weekday = (): DayHoursDto => ({
  ouvert: true,
  ouverture: '09:00',
  fermeture: '19:00',
  debutPause: '13:00',
  finPause: '14:00',
});

// Dimanche fermé, lundi à samedi avec pause déjeuner
const week = (): DayHoursDto[] => [
  { ouvert: false, ouverture: '09:00', fermeture: '17:00' },
  ...Array.from({ length: 6 }, weekday),
];

describe('règles des réglages', () => {
  it('accepte une semaine cohérente', () => {
    expect(weekErrors(week())).toEqual([]);
  });

  it('refuse des horaires incohérents, jour par jour', () => {
    const semaine = week();
    semaine[1] = { ouvert: true, ouverture: '10:00', fermeture: '09:00' };
    semaine[2] = { ...semaine[2], finPause: undefined };
    semaine[3] = { ...semaine[3], debutPause: '08:00' };
    // Un jour fermé n'est pas vérifié
    semaine[0] = { ouvert: false, ouverture: '18:00', fermeture: '08:00' };
    expect(weekErrors(semaine)).toEqual([
      "Lundi : la fermeture doit être après l'ouverture",
      'Mardi : indiquez le début et la fin de la pause',
      "Mercredi : la pause doit être pendant les heures d'ouverture",
    ]);
  });

  it('repère les destinations en double sans tenir compte de la casse', () => {
    expect(
      duplicatePlaces([
        { destination: 'Cocody', frais: 1 },
        { destination: 'Plateau', frais: 1 },
        { destination: 'cocody', frais: 2 },
      ]),
    ).toEqual(['cocody']);
  });

  it('calcule la taille décodée d’une data URL', () => {
    const bytes = Buffer.alloc(1001);
    expect(
      dataUrlBytes(`data:image/png;base64,${bytes.toString('base64')}`),
    ).toBe(1001);
  });

  it('formate la date du jour en yyyy-MM-dd', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
