import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { DataSource, EntityTarget } from 'typeorm';
import type { Session } from '../auth/sessions/session.entity';
import type { Action, TypeActeur, TypeCible } from './journal.rules';

export const JOURNAL_KEY = 'rodiq:journal';

export interface ActeurJournal {
  type: TypeActeur;
  id?: string | null;
  // Retrouvé d'après `id` s'il n'est pas fourni
  nom?: string | null;
}

export interface CibleJournal {
  type: TypeCible;
  id?: string | null;
  libelle?: string | null;
}

/** Ce que voit un extracteur : la requête, et la réponse une fois l'action réussie */
export interface ContexteJournal<R = any> {
  req: Request & { session?: Session };
  params: Record<string, string>;
  // Corps brut de la requête (avant la validation) : à lire prudemment
  corps: any;
  // Absente en cas d'échec
  reponse?: R;
  // Valeur lue par `avant`, avant l'exécution de l'action
  avant?: string;
}

export interface OptionsJournal<R = any> {
  /** Élément touché par l'action */
  cible?: (ctx: ContexteJournal<R>) => CibleJournal | undefined;
  /** Précision affichée sous l'action (motif…) */
  detail?: (ctx: ContexteJournal<R>) => unknown;
  /** Auteur, pour une route sans session (connexion, inscription) ; sinon la session de la requête */
  acteur?: (ctx: ContexteJournal<R>) => ActeurJournal | undefined;
  /**
   * Lecture faite avant l'action, quand la réponse ne permet plus de nommer la cible
   * (suppression). Un échec de lecture n'empêche pas l'action
   */
  avant?: (
    ctx: ContexteJournal<never>,
    dataSource: DataSource,
  ) => Promise<string | undefined>;
  /** Journalise aussi les refus d'accès (401) : tentatives de connexion */
  refus?: boolean;
  /** Condition pour journaliser (ex. déconnexion d'une session réellement ouverte) */
  si?: (ctx: ContexteJournal<R>) => boolean;
}

/**
 * Inscrit l'action au journal une fois réussie (lue par `JournalInterceptor`). L'acteur, l'adresse IP
 * et le navigateur sont tirés de la requête ; les options nomment la cible.
 */
export const Journaliser = <R = any>(
  action: Action,
  options: OptionsJournal<R> = {},
) => SetMetadata(JOURNAL_KEY, { action, options });

/** Pour `avant` : nom de l'élément `:param` avant sa suppression */
export const nomAvant =
  (entite: EntityTarget<{ id: string; nom: string }>, param = 'id') =>
  async ({ params }: ContexteJournal<never>, dataSource: DataSource) => {
    const element = await dataSource
      .getRepository(entite)
      .findOne({ where: { id: params[param] }, select: { nom: true } });
    return element?.nom;
  };

/** Texte du corps brut, ou undefined */
export const texte = (valeur: unknown) =>
  typeof valeur === 'string' && valeur.trim() ? valeur.trim() : undefined;
