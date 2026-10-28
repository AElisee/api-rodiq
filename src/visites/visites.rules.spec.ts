import {
  empreinte,
  estRobot,
  MAX_JOURS_PERIODE,
  periodeErrors,
} from './visites.rules';

describe('estRobot', () => {
  it('compte un navigateur', () => {
    expect(
      estRobot(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      ),
    ).toBe(false);
  });

  it('écarte les robots, les aperçus et un User-Agent absent', () => {
    expect(estRobot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(estRobot('WhatsApp/2.23.20.0')).toBe(true);
    expect(estRobot('curl/8.4.0')).toBe(true);
    expect(estRobot(undefined)).toBe(true);
    expect(estRobot('  ')).toBe(true);
  });
});

describe('empreinte', () => {
  it('dépend du sel, de l’IP et du navigateur', () => {
    const base = empreinte('sel', '1.2.3.4', 'ua');
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte('sel', '1.2.3.4', 'ua')).toBe(base);
    expect(empreinte('autre', '1.2.3.4', 'ua')).not.toBe(base);
    expect(empreinte('sel', '1.2.3.5', 'ua')).not.toBe(base);
    expect(empreinte('sel', '1.2.3.4', 'ua2')).not.toBe(base);
  });
});

describe('periodeErrors', () => {
  it('accepte un jour seul et la plage maximale', () => {
    expect(periodeErrors('2026-10-28', '2026-10-28')).toEqual([]);
    expect(periodeErrors('2025-09-24', '2026-10-28')).toEqual([]);
  });

  it('refuse une période inversée ou trop longue', () => {
    expect(periodeErrors('2026-10-29', '2026-10-28')).toEqual([
      'La date de début (2026-10-29) est après la date de fin (2026-10-28)',
    ]);
    expect(periodeErrors('2025-09-23', '2026-10-28')).toEqual([
      `Période trop longue : ${MAX_JOURS_PERIODE} jours au plus (du 2025-09-23 au 2026-10-28)`,
    ]);
  });
});
