import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { catchError, from, mergeMap, Observable, switchMap } from 'rxjs';
import { DataSource } from 'typeorm';
import {
  type ContexteJournal,
  JOURNAL_KEY,
  type OptionsJournal,
} from './journal.decorator';
import type { Action, Resultat } from './journal.rules';
import { JournalService } from './journal.service';

interface MetaJournal {
  action: Action;
  options: OptionsJournal;
}

/**
 * Intercepteur global : inscrit au journal chaque route marquée `@Journaliser`, après la réussite de
 * l'action (et les refus 401 si `refus`). L'écriture est attendue avant de répondre, pour qu'un écran
 * relu aussitôt la voie ; si elle échoue, l'erreur est consignée dans les logs et la réponse part
 * quand même : l'action est déjà faite, la refuser après coup tromperait l'utilisateur.
 */
@Injectable()
export class JournalInterceptor implements NestInterceptor {
  private readonly logger = new Logger(JournalInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly journal: JournalService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<MetaJournal | undefined>(
      JOURNAL_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<ContexteJournal['req']>();
    const base = (): ContexteJournal => ({
      req,
      params: req.params as Record<string, string>,
      corps: req.body,
    });

    return from(this.lireAvant(meta, base())).pipe(
      switchMap((avant) =>
        next.handle().pipe(
          mergeMap(async (reponse: unknown) => {
            await this.ecrire(meta, 'succes', { ...base(), avant, reponse });
            return reponse;
          }),
          catchError((error: unknown) =>
            from(
              (async () => {
                if (
                  meta.options.refus &&
                  error instanceof HttpException &&
                  error.getStatus() === HttpStatus.UNAUTHORIZED
                ) {
                  await this.ecrire(meta, 'echec', { ...base(), avant }, error);
                }
                throw error;
              })(),
            ),
          ),
        ),
      ),
    );
  }

  private async lireAvant(
    { action, options }: MetaJournal,
    ctx: ContexteJournal,
  ) {
    if (!options.avant) return undefined;
    try {
      return await options.avant(
        ctx as ContexteJournal<never>,
        this.dataSource,
      );
    } catch (error) {
      this.logger.warn(`Journal (${action}) : lecture préalable impossible`);
      this.logger.debug(error);
      return undefined;
    }
  }

  private async ecrire(
    { action, options }: MetaJournal,
    resultat: Resultat,
    ctx: ContexteJournal,
    error?: HttpException,
  ) {
    try {
      if (options.si && !options.si(ctx)) return;
      const session = ctx.req.session;
      const acteur =
        options.acteur?.(ctx) ??
        (session
          ? { type: session.kind, id: session.userId }
          : { type: 'anonyme' as const });
      await this.journal.enregistrer({
        action,
        resultat,
        acteur,
        cible: options.cible?.(ctx),
        detail: error ? error.message : options.detail?.(ctx),
        ip: ctx.req.ip,
        navigateur: ctx.req.headers['user-agent'],
      });
    } catch (e) {
      this.logger.error(
        `Journal : l'action « ${action} » (${resultat}) n'a pas pu être enregistrée`,
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
