import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, type SelectQueryBuilder } from 'typeorm';
import { Account } from '../auth/entities/account.entity';
import { Admin } from '../auth/entities/admin.entity';
import {
  dayKey,
  escapeLike,
  normalizeSearch,
} from '../reservations/reservations.rules';
import type {
  EvenementJournalDto,
  JournalPageDto,
  JournalQueryDto,
} from './dto/journal.dto';
import { EvenementJournal } from './entities/evenement-journal.entity';
import type { ActeurJournal, CibleJournal } from './journal.decorator';
import {
  ACTIONS,
  type Action,
  CATEGORIES,
  type Categorie,
  CONSERVATION_JOURS,
  decalageFuseau,
  libelleAction,
  periodeErrors,
  bornesPeriode,
  type Resultat,
  tronquer,
} from './journal.rules';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface EntreeJournal {
  action: Action;
  resultat: Resultat;
  acteur: ActeurJournal;
  cible?: CibleJournal;
  detail?: unknown;
  ip?: string;
  navigateur?: string;
}

const toDto = (e: EvenementJournal): EvenementJournalDto => ({
  id: e.id,
  le: e.le,
  categorie: e.categorie,
  action: e.action,
  libelle: libelleAction(e.action),
  resultat: e.resultat,
  acteur: { type: e.acteurType, id: e.acteurId, nom: e.acteurNom },
  cible: e.cibleType
    ? { type: e.cibleType, id: e.cibleId, libelle: e.cibleLibelle }
    : null,
  detail: e.detail,
  ip: e.ip,
  navigateur: e.navigateur,
});

@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);
  // Jour de la dernière purge sur cette instance : au plus une par jour
  private purgeLe: string | undefined;

  constructor(
    @InjectRepository(EvenementJournal)
    private readonly evenements: Repository<EvenementJournal>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
  ) {}

  async enregistrer({
    action,
    resultat,
    acteur,
    cible,
    detail,
    ip,
    navigateur,
  }: EntreeJournal) {
    const acteurNom = tronquer(
      acteur.nom ?? (await this.nomActeur(acteur)),
      254,
    );
    const entree = {
      categorie: ACTIONS[action].categorie,
      action,
      resultat,
      acteurType: acteur.type,
      acteurId: acteur.id ?? null,
      acteurNom,
      cibleType: cible?.type ?? null,
      cibleId: tronquer(cible?.id, 100),
      cibleLibelle: tronquer(cible?.libelle, 200),
      detail: tronquer(detail, 500),
      ip: tronquer(ip, 45),
      navigateur: tronquer(navigateur, 255),
    };
    await this.evenements.insert({
      ...entree,
      recherche: normalizeSearch(
        [
          libelleAction(action),
          entree.acteurNom,
          entree.cibleLibelle,
          entree.cibleId,
          entree.detail,
          entree.ip,
        ]
          .filter(Boolean)
          .join(' '),
      ).slice(0, 1000),
    });
    await this.purger();
  }

  async list({
    categorie,
    acteur,
    resultat,
    du,
    au,
    jour,
    q,
    page,
    parPage,
  }: JournalQueryDto): Promise<JournalPageDto> {
    const errors = periodeErrors(du, au, jour);
    if (errors.length > 0) throw new BadRequestException(errors);
    const { depuis, avant } = bornesPeriode(du, au);
    const search = q && normalizeSearch(q);

    // Filtres communs à la liste et aux compteurs par catégorie (sauf la catégorie elle-même)
    const filtrer = (qb: SelectQueryBuilder<EvenementJournal>) => {
      if (acteur) qb.andWhere('e.acteurType = :acteur', { acteur });
      if (resultat) qb.andWhere('e.resultat = :resultat', { resultat });
      if (depuis) qb.andWhere('e.le >= :depuis', { depuis });
      if (avant) qb.andWhere('e.le < :avant', { avant });
      if (search) {
        qb.andWhere('e.recherche LIKE :search', {
          search: `%${escapeLike(search)}%`,
        });
      }
      return qb;
    };

    // Liste et jours : tous les filtres, catégorie comprise
    const avecCategorie = () => {
      const qb = filtrer(this.evenements.createQueryBuilder('e'));
      if (categorie) qb.andWhere('e.categorie = :categorie', { categorie });
      return qb;
    };

    const liste = avecCategorie();
    if (jour) {
      const bornes = bornesPeriode(jour, jour);
      liste.andWhere('e.le >= :jourDebut AND e.le < :jourFin', {
        jourDebut: bornes.depuis,
        jourFin: bornes.avant,
      });
    }
    const jourSql = `DATE_FORMAT(CONVERT_TZ(e.le, :fuseau, '+00:00'), '%Y-%m-%d')`;
    const [[rows, total], comptes, jours] = await Promise.all([
      liste
        .orderBy('e.le', 'DESC')
        .addOrderBy('e.id', 'DESC')
        .skip((page - 1) * parPage)
        .take(parPage)
        .getManyAndCount(),
      filtrer(this.evenements.createQueryBuilder('e'))
        .select('e.categorie', 'categorie')
        .addSelect('COUNT(*)', 'nombre')
        .groupBy('e.categorie')
        .getRawMany<{ categorie: Categorie; nombre: string | number }>(),
      avecCategorie()
        .select(jourSql, 'jour')
        .addSelect('COUNT(*)', 'nombre')
        .setParameter('fuseau', decalageFuseau())
        .groupBy('jour')
        .orderBy('jour', 'DESC')
        .getRawMany<{ jour: string; nombre: string | number }>(),
    ]);

    const parCategorie = Object.fromEntries(
      CATEGORIES.map((c) => [c, 0]),
    ) as Record<Categorie, number>;
    for (const { categorie: c, nombre } of comptes) {
      parCategorie[c] = Number(nombre);
    }
    return {
      elements: rows.map(toDto),
      total,
      page,
      parPage,
      parCategorie,
      jours: jours.map((j) => ({ jour: j.jour, nombre: Number(j.nombre) })),
    };
  }

  // Nom copié dans l'entrée : il reste lisible même si le compte change ensuite
  private async nomActeur({ type, id }: ActeurJournal) {
    if (!id) return null;
    if (type === 'admin') {
      return (await this.admins.findOneBy({ id }))?.email ?? null;
    }
    if (type === 'client') {
      const account = await this.accounts.findOneBy({ id });
      return account ? `${account.firstName} ${account.lastName}` : null;
    }
    return null;
  }

  private async purger() {
    const jour = dayKey(new Date());
    if (this.purgeLe === jour) return;
    this.purgeLe = jour;
    const { affected } = await this.evenements.delete({
      le: LessThan(new Date(Date.now() - CONSERVATION_JOURS * DAY_MS)),
    });
    if (affected) {
      this.logger.log(
        `Journal : ${affected} entrée(s) de plus de ${CONSERVATION_JOURS} jours supprimée(s)`,
      );
    }
  }
}
