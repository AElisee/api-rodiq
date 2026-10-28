import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  type EntityManager,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Account } from '../auth/entities/account.entity';
import { PrestationsService } from '../prestations/prestations.service';
import { ClosedDate } from '../settings/entities/closed-date.entity';
import { SETTINGS_ID, Settings } from '../settings/entities/settings.entity';
import type {
  CancelReservationDto,
  CreateReservationDto,
  CreneauDto,
  LigneReservationDto,
  RejectReservationDto,
  ReservationAdminDto,
  ReservationClienteDto,
  ReservationDto,
  ReservationsPageDto,
  ReservationsQueryDto,
} from './dto/reservations.dto';
import { Reservation } from './entities/reservation.entity';
import {
  ACTIVE_STATUTS,
  bookableSlots,
  canCancel,
  cancellationDeadline,
  dayKey,
  escapeLike,
  findSlot,
  formatDay,
  formatDayTime,
  linesTotal,
  MAX_ACTIVE_RESERVATIONS,
  newReference,
  normalizeSearch,
  slotStart,
  STATUTS,
  type Statut,
  statusConflict,
} from './reservations.rules';

const settingsNotFound = () =>
  new NotFoundException(
    "Le salon n'est pas encore configuré : les réservations ne sont pas ouvertes",
  );

const toDto = (r: Reservation): ReservationDto => ({
  id: r.id,
  reference: r.reference,
  date: r.date,
  debut: r.debut,
  fin: r.fin,
  statut: r.statut,
  lignes: r.lignes,
  total: r.total,
  totalAPartirDe: r.lignes.some((line) => line.prixAPartirDe),
  contact: {
    prenom: r.prenom,
    nom: r.nom,
    telephone: r.telephone,
    whatsapp: r.whatsapp,
    email: r.email,
  },
  canalContact: r.canalContact,
  note: r.note,
  motifRefus: r.motifRefus,
  motifAnnulation: r.motifAnnulation,
  creeLe: r.creeLe,
  traiteeLe: r.traiteeLe,
});

const toClientDto = (
  r: Reservation,
  noticeHours: number | null,
): ReservationClienteDto => ({
  ...toDto(r),
  annulable: canCancel(r, noticeHours),
  dateLimiteAnnulation: cancellationDeadline(r, noticeHours).toISOString(),
});

const toAdminDto = (r: Reservation): ReservationAdminDto => ({
  ...toDto(r),
  compteId: r.compteId,
});

const ORDERS = {
  'date-asc': [
    ['r.date', 'ASC'],
    ['r.debut', 'ASC'],
  ],
  'date-desc': [
    ['r.date', 'DESC'],
    ['r.debut', 'DESC'],
  ],
  demande: [['r.creeLe', 'DESC']],
  nom: [
    ['r.nom', 'ASC'],
    ['r.prenom', 'ASC'],
  ],
} as const;

@Injectable()
export class ReservationsService implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
    @InjectRepository(Settings)
    private readonly settings: Repository<Settings>,
    @InjectRepository(ClosedDate)
    private readonly closedDates: Repository<ClosedDate>,
    private readonly prestations: PrestationsService,
  ) {}

  // Réservations créées avant la colonne `total` : la calculer une fois depuis leurs lignes figées
  async onModuleInit() {
    const missing = await this.reservations.find({
      select: { id: true, lignes: true },
      where: { total: 0 },
    });
    for (const { id, lignes } of missing) {
      const total = linesTotal(lignes);
      if (total > 0) await this.reservations.update(id, { total });
    }
  }

  // Créneaux de la fenêtre avec leurs places libres : seuls des nombres, jamais d'identité
  async slots(): Promise<CreneauDto[]> {
    const settings = await this.loadSettings();
    const now = new Date();
    const closed = await this.closedDates.findBy({
      date: MoreThanOrEqual(dayKey(now)),
    });
    const slots = bookableSlots(
      settings,
      new Set(closed.map((c) => c.date)),
      now,
    );
    if (!slots.length) return [];

    const taken = await this.reservations
      .createQueryBuilder('r')
      .select("DATE_FORMAT(r.date, '%Y-%m-%d')", 'date')
      .addSelect('r.debut', 'debut')
      .addSelect('COUNT(*)', 'n')
      .where('r.statut IN (:...actifs)', { actifs: ACTIVE_STATUTS })
      .andWhere('r.date BETWEEN :du AND :au', {
        du: slots[0].date,
        au: slots.at(-1)!.date,
      })
      .groupBy('r.date')
      .addGroupBy('r.debut')
      .getRawMany<{ date: string; debut: string; n: string }>();
    const counts = new Map(
      taken.map(({ date, debut, n }) => [`${date}_${debut}`, Number(n)]),
    );
    const places = settings.placesParCreneau;
    return slots.map((slot) => ({
      ...slot,
      placesRestantes:
        places === null
          ? null
          : Math.max(
              0,
              places - (counts.get(`${slot.date}_${slot.debut}`) ?? 0),
            ),
    }));
  }

  async create(
    compteId: string,
    dto: CreateReservationDto,
  ): Promise<ReservationClienteDto> {
    const account = await this.accounts.findOneBy({ id: compteId });
    if (!account) {
      throw new UnauthorizedException(
        'Compte introuvable : reconnectez-vous pour réserver',
      );
    }
    const lignes = await this.lines(dto.prestationIds);

    // READ COMMITTED : après le verrou des réglages, les comptages voient les réservations
    // validées entre-temps par une autre requête
    const { reservation, noticeHours } = await this.dataSource.transaction(
      'READ COMMITTED',
      async (manager) => {
        // Verrou de la ligne des réglages : les réservations passent une à une, deux clientes ne
        // peuvent pas prendre la même dernière place (ni l'admin fermer le jour en même temps)
        const settings = await lockSettings(manager);
        const now = new Date();
        const found = findSlot(
          settings,
          await manager.findOneBy(ClosedDate, { date: dto.date }),
          dto.date,
          dto.debut,
          now,
        );
        if ('error' in found) throw new BadRequestException([found.error]);
        const { slot } = found;

        const active = await manager.find(Reservation, {
          select: { reference: true, date: true, debut: true },
          where: {
            compteId,
            statut: In(ACTIVE_STATUTS),
            date: MoreThanOrEqual(dayKey(now)),
          },
          order: { date: 'ASC', debut: 'ASC' },
        });
        const same = active.find(
          (r) => r.date === slot.date && r.debut === slot.debut,
        );
        if (same) {
          throw new ConflictException(
            `Vous avez déjà réservé ce créneau (référence ${same.reference})`,
          );
        }
        if (active.length >= MAX_ACTIVE_RESERVATIONS) {
          throw new ConflictException(
            `Vous avez déjà ${active.length} réservations en cours (${active.map((r) => r.reference).join(', ')}) : ` +
              'annulez-en une ou attendez qu’un rendez-vous soit passé pour réserver à nouveau',
          );
        }
        if (settings.placesParCreneau !== null) {
          const taken = await manager.countBy(Reservation, {
            date: slot.date,
            debut: slot.debut,
            statut: In(ACTIVE_STATUTS),
          });
          if (taken >= settings.placesParCreneau) {
            throw new ConflictException(
              `Le créneau de ${slot.debut} le ${formatDay(slot.date)} est complet : choisissez-en un autre`,
            );
          }
        }

        const reference = await uniqueReference(manager);
        const { id } = await manager.save(
          manager.create(Reservation, {
            reference,
            compteId,
            ...slot,
            statut: 'en_attente',
            lignes,
            total: linesTotal(lignes),
            prenom: account.firstName,
            nom: account.lastName,
            telephone: account.phone,
            whatsapp: account.whatsapp,
            email: account.email,
            canalContact: dto.canalContact,
            note: dto.note ?? '',
            motifRefus: null,
            motifAnnulation: null,
            recherche: normalizeSearch(
              [
                account.firstName,
                account.lastName,
                account.phone,
                account.whatsapp ?? '',
                account.email,
                reference,
              ].join(''),
            ),
            traiteeLe: null,
          }),
        );
        return {
          reservation: await manager.findOneByOrFail(Reservation, { id }),
          noticeHours: settings.regles.delaiAnnulationHeures,
        };
      },
    );
    return toClientDto(reservation, noticeHours);
  }

  // Réservations de la cliente connectée, la plus récente d'abord
  async listOwn(compteId: string): Promise<ReservationClienteDto[]> {
    const [settings, reservations] = await Promise.all([
      this.loadSettings(),
      this.reservations.find({
        where: { compteId },
        order: { date: 'DESC', debut: 'DESC' },
      }),
    ]);
    return reservations.map((r) =>
      toClientDto(r, settings.regles.delaiAnnulationHeures),
    );
  }

  async cancel(
    compteId: string,
    id: string,
    { motif }: CancelReservationDto,
  ): Promise<ReservationClienteDto> {
    // Filtre sur le compte : la réservation d'une autre cliente répond 404, comme si elle n'existait pas
    const reservation = await this.reservations.findOneBy({ id, compteId });
    if (!reservation) {
      throw new NotFoundException(
        'Réservation introuvable : elle n’existe pas ou n’est pas liée à votre compte',
      );
    }
    const settings = await this.loadSettings();
    const noticeHours = settings.regles.delaiAnnulationHeures;
    this.assertStatus(reservation, ACTIVE_STATUTS, 'annulée');
    if (!canCancel(reservation, noticeHours)) {
      throw new ConflictException(
        `L’annulation en ligne était possible jusqu’au ${formatDayTime(cancellationDeadline(reservation, noticeHours))} : ` +
          'contactez le salon pour annuler ce rendez-vous',
      );
    }
    const updated = await this.transition(
      reservation,
      ACTIVE_STATUTS,
      'annulée',
      {
        statut: 'annulee',
        motifAnnulation: motif || null,
      },
    );
    return toClientDto(updated, noticeHours);
  }

  async list({
    statut,
    quand,
    q,
    tri,
    page,
    parPage,
  }: ReservationsQueryDto): Promise<ReservationsPageDto> {
    // Filtres communs à la page et aux compteurs par statut (qui ignorent le filtre de statut)
    const filtered = () => {
      const query = this.reservations.createQueryBuilder('r');
      if (quand) {
        query.andWhere(
          quand === 'a-venir' ? 'r.date >= :today' : 'r.date < :today',
          { today: dayKey(new Date()) },
        );
      }
      const search = q && normalizeSearch(q);
      if (search) {
        query.andWhere('r.recherche LIKE :search', {
          search: `%${escapeLike(search)}%`,
        });
      }
      return query;
    };

    const query = filtered();
    if (statut) query.andWhere('r.statut = :statut', { statut });
    for (const [column, direction] of ORDERS[tri]) {
      query.addOrderBy(column, direction);
    }
    const [[reservations, total], counts] = await Promise.all([
      query
        .skip((page - 1) * parPage)
        .take(parPage)
        .getManyAndCount(),
      filtered()
        .select('r.statut', 'statut')
        .addSelect('COUNT(*)', 'n')
        .groupBy('r.statut')
        .getRawMany<{ statut: Statut; n: string }>(),
    ]);
    const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0])) as Record<
      Statut,
      number
    >;
    for (const { statut: s, n } of counts) parStatut[s] = Number(n);
    return {
      elements: reservations.map(toAdminDto),
      total,
      page,
      parPage,
      parStatut,
    };
  }

  async get(id: string): Promise<ReservationAdminDto> {
    return toAdminDto(await this.loadForAdmin(id));
  }

  async confirm(id: string): Promise<ReservationAdminDto> {
    const reservation = await this.loadForAdmin(id);
    this.assertStatus(reservation, ['en_attente'], 'confirmée');
    this.assertUpcoming(reservation, 'confirmé');
    return toAdminDto(
      await this.transition(reservation, ['en_attente'], 'confirmée', {
        statut: 'confirmee',
      }),
    );
  }

  async reject(
    id: string,
    { motif }: RejectReservationDto,
  ): Promise<ReservationAdminDto> {
    const reservation = await this.loadForAdmin(id);
    this.assertStatus(reservation, ACTIVE_STATUTS, 'refusée');
    this.assertUpcoming(reservation, 'refusé');
    return toAdminDto(
      await this.transition(reservation, ACTIVE_STATUTS, 'refusée', {
        statut: 'refusee',
        motifRefus: motif,
      }),
    );
  }

  async complete(id: string): Promise<ReservationAdminDto> {
    const reservation = await this.loadForAdmin(id);
    this.assertStatus(reservation, ['confirmee'], 'marquée terminée');
    if (reservation.date > dayKey(new Date())) {
      throw new ConflictException(
        `Le rendez-vous ${reservation.reference} est prévu le ${formatDay(reservation.date)} : ` +
          'il ne peut être marqué terminé qu’à partir de ce jour',
      );
    }
    return toAdminDto(
      await this.transition(reservation, ['confirmee'], 'marquée terminée', {
        statut: 'terminee',
      }),
    );
  }

  // Prestations de la carte figées dans la réservation, dans l'ordre choisi ; les prix viennent
  // de la carte, jamais du navigateur
  private async lines(ids: string[]): Promise<LigneReservationDto[]> {
    const prestations = new Map(
      (await this.prestations.findByIds(ids)).map((p) => [p.id, p]),
    );
    const missing = ids.filter((id) => !prestations.has(id));
    if (missing.length) {
      throw new BadRequestException(
        missing.map(
          (id) =>
            `La prestation « ${id} » n’est plus à la carte : rechargez la page et choisissez à nouveau`,
        ),
      );
    }
    return ids.map((id) => {
      const { nom, prix, prixAPartirDe } = prestations.get(id)!;
      return { prestationId: id, nom, prix, prixAPartirDe };
    });
  }

  private async loadSettings() {
    const settings = await this.settings.findOneBy({ id: SETTINGS_ID });
    if (!settings) throw settingsNotFound();
    return settings;
  }

  private async loadForAdmin(id: string) {
    const reservation = await this.reservations.findOneBy({ id });
    if (!reservation) {
      throw new NotFoundException(
        'Réservation introuvable : elle n’existe pas ou l’identifiant est erroné',
      );
    }
    return reservation;
  }

  private assertStatus(
    reservation: Reservation,
    from: Statut[],
    action: string,
  ) {
    if (!from.includes(reservation.statut)) {
      throw new ConflictException(
        statusConflict(reservation.reference, reservation.statut, action),
      );
    }
  }

  private assertUpcoming(reservation: Reservation, action: string) {
    if (slotStart(reservation.date, reservation.debut) <= new Date()) {
      throw new ConflictException(
        `Le rendez-vous ${reservation.reference} du ${formatDay(reservation.date)} à ${reservation.debut} ` +
          `est déjà passé : il ne peut plus être ${action}`,
      );
    }
  }

  // Changement de statut atomique : la mise à jour n'aboutit que si le statut n'a pas changé
  // entre-temps (admin et cliente en même temps) ; sinon on relit pour dire ce qui s'est passé
  private async transition(
    reservation: Reservation,
    from: Statut[],
    action: string,
    changes: Partial<
      Pick<Reservation, 'statut' | 'motifRefus' | 'motifAnnulation'>
    >,
  ) {
    const { affected } = await this.reservations.update(
      { id: reservation.id, statut: In(from) },
      { ...changes, traiteeLe: new Date() },
    );
    const current = await this.reservations.findOneByOrFail({
      id: reservation.id,
    });
    if (!affected) {
      throw new ConflictException(
        statusConflict(current.reference, current.statut, action),
      );
    }
    return current;
  }
}

/** Ligne des réglages verrouillée jusqu'à la fin de la transaction */
const lockSettings = async (manager: EntityManager) => {
  const settings = await manager.findOne(Settings, {
    where: { id: SETTINGS_ID },
    lock: { mode: 'pessimistic_write' },
  });
  if (!settings) throw settingsNotFound();
  return settings;
};

// Référence unique : 32⁶ combinaisons, une collision est improbable mais vérifiée
const uniqueReference = async (manager: EntityManager) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    if (!(await manager.existsBy(Reservation, { reference }))) return reference;
  }
  throw new InternalServerErrorException(
    'Impossible de générer une référence de réservation : réessayez',
  );
};
