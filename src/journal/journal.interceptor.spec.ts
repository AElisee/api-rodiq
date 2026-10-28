import {
  ConflictException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { DataSource } from 'typeorm';
import { Journaliser } from './journal.decorator';
import { JournalInterceptor } from './journal.interceptor';
import type { JournalService } from './journal.service';

class Routes {
  @Journaliser<{ id: string; reference: string }>('reservation.confirmee', {
    cible: ({ reponse }) => ({
      type: 'reservation',
      id: reponse?.id,
      libelle: reponse?.reference,
    }),
  })
  confirmer() {}

  @Journaliser('connexion.reussie', {
    acteur: ({ corps }) => ({ type: 'anonyme', nom: corps.email }),
    refus: true,
  })
  connexion() {}

  @Journaliser('prestation.supprimee', {
    avant: () => Promise.resolve('Pose gel'),
    cible: ({ avant }) => ({ type: 'prestation', libelle: avant }),
  })
  supprimer() {}

  lire() {}
}

const contexte = (handler: keyof Routes, req: object): ExecutionContext =>
  ({
    getHandler: () => Routes.prototype[handler],
    switchToHttp: () => ({ getRequest: () => req }),
  }) as unknown as ExecutionContext;

const requete = {
  params: {},
  body: { email: 'x@exemple.ci' },
  ip: '41.202.219.12',
  headers: { 'user-agent': 'Mozilla/5.0' },
  session: { kind: 'admin', userId: 'admin-1' },
};

describe('JournalInterceptor', () => {
  let enregistrer: jest.Mock;
  let interceptor: JournalInterceptor;

  beforeEach(() => {
    enregistrer = jest.fn().mockResolvedValue(undefined);
    interceptor = new JournalInterceptor(
      new Reflector(),
      { enregistrer } as unknown as JournalService,
      {} as DataSource,
    );
  });

  it('inscrit une action réussie avec la session, la cible, l’IP et le navigateur', async () => {
    const reponse = { id: 'r1', reference: 'RDQ-H9XC3B' };
    const resultat = await firstValueFrom(
      interceptor.intercept(contexte('confirmer', requete), {
        handle: () => of(reponse),
      }),
    );
    expect(resultat).toBe(reponse);
    expect(enregistrer).toHaveBeenCalledWith({
      action: 'reservation.confirmee',
      resultat: 'succes',
      acteur: { type: 'admin', id: 'admin-1' },
      cible: { type: 'reservation', id: 'r1', libelle: 'RDQ-H9XC3B' },
      detail: undefined,
      ip: '41.202.219.12',
      navigateur: 'Mozilla/5.0',
    });
  });

  it('ignore une route sans @Journaliser', async () => {
    await firstValueFrom(
      interceptor.intercept(contexte('lire', requete), { handle: () => of(1) }),
    );
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('inscrit un refus de connexion (401) puis relance l’erreur', async () => {
    const refus = new UnauthorizedException('E-mail ou mot de passe incorrect');
    await expect(
      firstValueFrom(
        interceptor.intercept(contexte('connexion', requete), {
          handle: () => throwError(() => refus),
        }),
      ),
    ).rejects.toBe(refus);
    expect(enregistrer).toHaveBeenCalledWith(
      expect.objectContaining({
        resultat: 'echec',
        acteur: { type: 'anonyme', nom: 'x@exemple.ci' },
        detail: 'E-mail ou mot de passe incorrect',
      }),
    );
  });

  it('n’inscrit pas une action refusée par une autre erreur', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(contexte('confirmer', requete), {
          handle: () => throwError(() => new ConflictException('Déjà fait')),
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enregistrer).not.toHaveBeenCalled();
  });

  it('nomme la cible avec la lecture faite avant l’action', async () => {
    await firstValueFrom(
      interceptor.intercept(contexte('supprimer', requete), {
        handle: () => of([]),
      }),
    );
    expect(enregistrer).toHaveBeenCalledWith(
      expect.objectContaining({
        cible: { type: 'prestation', libelle: 'Pose gel' },
      }),
    );
  });

  it('répond quand même si le journal ne peut pas être écrit', async () => {
    enregistrer.mockRejectedValue(new Error('Base injoignable'));
    jest.spyOn(interceptor['logger'], 'error').mockImplementation(() => {});
    await expect(
      firstValueFrom(
        interceptor.intercept(contexte('confirmer', requete), {
          handle: () => of({ id: 'r1', reference: 'RDQ-H9XC3B' }),
        }),
      ),
    ).resolves.toEqual({ id: 'r1', reference: 'RDQ-H9XC3B' });
  });
});
