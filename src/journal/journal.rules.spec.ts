import {
  ACTIONS,
  bornesPeriode,
  CATEGORIES,
  decalageFuseau,
  libelleAction,
  periodeErrors,
  tronquer,
} from './journal.rules';

describe('ACTIONS', () => {
  it('range chaque action dans une catégorie connue', () => {
    for (const { categorie } of Object.values(ACTIONS)) {
      expect(CATEGORIES).toContain(categorie);
    }
  });

  it('tient chaque code dans sa colonne (50 caractères)', () => {
    for (const code of Object.keys(ACTIONS)) {
      expect(code.length).toBeLessThanOrEqual(50);
    }
  });
});

describe('libelleAction', () => {
  it('donne le libellé du catalogue, ou le code s’il est inconnu', () => {
    expect(libelleAction('reservation.refusee')).toBe('Réservation refusée');
    expect(libelleAction('ancienne.action')).toBe('ancienne.action');
  });
});

describe('tronquer', () => {
  it('nettoie les espaces et coupe à la taille de la colonne', () => {
    expect(tronquer('  Le salon\n est   fermé ', 100)).toBe(
      'Le salon est fermé',
    );
    expect(tronquer('abcdef', 4)).toBe('abc…');
    expect(tronquer('abcd', 4)).toBe('abcd');
  });

  it('rend null pour un texte vide ou qui n’en est pas un', () => {
    expect(tronquer('   ', 10)).toBeNull();
    expect(tronquer(undefined, 10)).toBeNull();
    expect(tronquer(42, 10)).toBeNull();
  });
});

describe('periodeErrors', () => {
  it('accepte une borne seule, un jour seul et une période dans l’ordre', () => {
    expect(periodeErrors()).toEqual([]);
    expect(periodeErrors('2026-10-01')).toEqual([]);
    expect(periodeErrors(undefined, '2026-10-28')).toEqual([]);
    expect(periodeErrors('2026-10-28', '2026-10-28')).toEqual([]);
  });

  it('refuse une période inversée', () => {
    expect(periodeErrors('2026-10-29', '2026-10-28')).toEqual([
      'La date de début (2026-10-29) est après la date de fin (2026-10-28)',
    ]);
  });

  it('refuse un jour affiché hors de la période', () => {
    expect(periodeErrors('2026-10-01', '2026-10-28', '2026-10-15')).toEqual([]);
    expect(periodeErrors('2026-10-01', '2026-10-28', '2026-09-30')).toEqual([
      'Le jour affiché (2026-09-30) est avant la date de début (2026-10-01)',
    ]);
    expect(periodeErrors(undefined, '2026-10-28', '2026-10-29')).toEqual([
      'Le jour affiché (2026-10-29) est après la date de fin (2026-10-28)',
    ]);
  });
});

describe('decalageFuseau', () => {
  // getTimezoneOffset : minutes à ajouter à l'heure locale pour obtenir l'UTC
  const aDecalage = (offset: number) =>
    ({ getTimezoneOffset: () => offset }) as Date;

  it('écrit le décalage du fuseau local au format SQL', () => {
    expect(decalageFuseau(aDecalage(0))).toBe('+00:00');
    expect(decalageFuseau(aDecalage(-60))).toBe('+01:00');
    expect(decalageFuseau(aDecalage(-330))).toBe('+05:30');
    expect(decalageFuseau(aDecalage(240))).toBe('-04:00');
  });
});

describe('bornesPeriode', () => {
  it('couvre le dernier jour en entier', () => {
    expect(bornesPeriode('2026-10-01', '2026-10-28')).toEqual({
      depuis: new Date('2026-10-01T00:00:00Z'),
      avant: new Date('2026-10-29T00:00:00Z'),
    });
    expect(bornesPeriode()).toEqual({ depuis: undefined, avant: undefined });
  });
});
