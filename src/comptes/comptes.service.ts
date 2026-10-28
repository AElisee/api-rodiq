import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Account, accountSearchText } from '../auth/entities/account.entity';
import { Commande } from '../commandes/entities/commande.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import {
  escapeLike,
  normalizeSearch,
} from '../reservations/reservations.rules';
import type {
  CompteClientDetailDto,
  CompteClientDto,
  ComptesPageDto,
  ComptesQueryDto,
  Tri,
} from './dto/comptes.dto';

// Activité de chaque compte, calculée par MySQL pour trier et paginer sans tout charger.
// Dépenses estimées = soins terminés + commandes remises (montants figés à la réservation / commande)
const ACTIVITY_SQL = `
  SELECT a.id, a.firstName, a.lastName, a.phone, a.whatsapp, a.email, a.createdAt,
    COALESCE(r.nombre, 0) AS nombreReservations,
    r.dernier AS dernierRendezVous,
    COALESCE(c.nombre, 0) AS nombreCommandes,
    COALESCE(r.montant, 0) + COALESCE(c.montant, 0) AS depensesEstimees
  FROM accounts a
  LEFT JOIN (
    SELECT compteId, COUNT(*) AS nombre, DATE_FORMAT(MAX(\`date\`), '%Y-%m-%d') AS dernier,
      SUM(IF(statut = 'terminee', total, 0)) AS montant
    FROM reservations GROUP BY compteId
  ) r ON r.compteId = a.id
  LEFT JOIN (
    SELECT compteId, COUNT(*) AS nombre, SUM(IF(statut = 'livree', total, 0)) AS montant
    FROM commandes GROUP BY compteId
  ) c ON c.compteId = a.id`;

// Colonnes fixes (jamais tirées de la requête HTTP) ; départage par inscription récente
const ORDERS: Record<Tri, string> = {
  recentes: 'a.createdAt DESC',
  nom: 'a.lastName ASC, a.firstName ASC',
  reservations: 'nombreReservations DESC',
  commandes: 'nombreCommandes DESC',
  depenses: 'depensesEstimees DESC',
};

interface ActivityRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  whatsapp: string | null;
  email: string;
  createdAt: Date;
  // COUNT et SUM arrivent en texte (BIGINT / DECIMAL)
  nombreReservations: string | number;
  dernierRendezVous: string | null;
  nombreCommandes: string | number;
  depensesEstimees: string | number;
}

const toDto = (row: ActivityRow): CompteClientDto => ({
  id: row.id,
  prenom: row.firstName,
  nom: row.lastName,
  telephone: row.phone,
  whatsapp: row.whatsapp,
  email: row.email,
  creeLe: row.createdAt,
  nombreReservations: Number(row.nombreReservations),
  dernierRendezVous: row.dernierRendezVous,
  nombreCommandes: Number(row.nombreCommandes),
  depensesEstimees: Number(row.depensesEstimees),
});

@Injectable()
export class ComptesService implements OnModuleInit {
  private readonly logger = new Logger(ComptesService.name);

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    @InjectRepository(Commande)
    private readonly commandes: Repository<Commande>,
  ) {}

  // Comptes créés avant la colonne `recherche` : la remplir une fois pour qu'ils soient trouvables
  async onModuleInit() {
    const missing = await this.accounts.findBy({ recherche: '' });
    for (const account of missing) {
      await this.accounts.update(account.id, {
        recherche: accountSearchText(account),
      });
    }
    if (missing.length > 0) {
      this.logger.log(`Recherche indexée pour ${missing.length} compte(s)`);
    }
  }

  async list({
    q,
    tri,
    page,
    parPage,
  }: ComptesQueryDto): Promise<ComptesPageDto> {
    const search = q && normalizeSearch(q);
    const pattern = search ? `%${escapeLike(search)}%` : null;
    const where = pattern ? 'WHERE a.recherche LIKE ?' : '';
    const [rows, total] = await Promise.all([
      this.accounts.query<ActivityRow[]>(
        `${ACTIVITY_SQL} ${where}
         ORDER BY ${ORDERS[tri]}, a.createdAt DESC, a.id ASC
         LIMIT ? OFFSET ?`,
        [...(pattern ? [pattern] : []), parPage, (page - 1) * parPage],
      ),
      this.accounts.countBy(pattern ? { recherche: Like(pattern) } : {}),
    ]);
    return { elements: rows.map(toDto), total, page, parPage };
  }

  async get(id: string): Promise<CompteClientDetailDto> {
    const [[row], reservations, commandes] = await Promise.all([
      this.accounts.query<ActivityRow[]>(`${ACTIVITY_SQL} WHERE a.id = ?`, [
        id,
      ]),
      this.reservations.find({
        where: { compteId: id },
        order: { date: 'DESC', debut: 'DESC' },
      }),
      this.commandes.find({
        where: { compteId: id },
        order: { creeLe: 'DESC' },
      }),
    ]);
    if (!row) {
      throw new NotFoundException(
        'Compte client introuvable : aucun compte ne porte cet identifiant',
      );
    }
    return {
      ...toDto(row),
      reservations: reservations.map((r) => ({
        id: r.id,
        reference: r.reference,
        date: r.date,
        debut: r.debut,
        fin: r.fin,
        statut: r.statut,
        total: r.total,
        totalAPartirDe: r.lignes.some((line) => line.prixAPartirDe),
      })),
      commandes: commandes.map((c) => ({
        id: c.id,
        reference: c.reference,
        creeLe: c.creeLe,
        statut: c.statut,
        mode: c.mode,
        payee: c.payee,
        nombreArticles: c.lignes.reduce((sum, line) => sum + line.quantite, 0),
        total: c.total,
      })),
    };
  }
}
