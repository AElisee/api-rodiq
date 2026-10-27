import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, In, Not, Repository } from 'typeorm';
import { Account } from '../auth/entities/account.entity';
import { ProductVariant } from '../boutique/entities/product-variant.entity';
import { Product } from '../boutique/entities/product.entity';
import {
  escapeLike,
  normalizeSearch,
} from '../reservations/reservations.rules';
import { SETTINGS_ID, Settings } from '../settings/entities/settings.entity';
import {
  CLIENT_CANCELLABLE,
  type CatalogProduct,
  duplicateLineErrors,
  formatPrice,
  MAX_PENDING_ORDERS,
  newReference,
  type OrderLine,
  resolveDelivery,
  resolveLines,
  SALON_CANCELLABLE,
  STATUTS,
  type Statut,
  statusConflict,
  subtotal,
} from './commandes.rules';
import type {
  AdminCancelCommandeDto,
  CancelCommandeDto,
  CommandeAdminDto,
  CommandeClienteDto,
  CommandeDto,
  CommandesPageDto,
  CommandesQueryDto,
  CreateCommandeDto,
} from './dto/commandes.dto';
import { Commande } from './entities/commande.entity';

const toDto = (c: Commande): CommandeDto => ({
  id: c.id,
  reference: c.reference,
  statut: c.statut,
  lignes: c.lignes,
  sousTotal: c.sousTotal,
  fraisLivraison: c.fraisLivraison,
  total: c.total,
  mode: c.mode,
  destination: c.destination,
  adresse: c.adresse,
  modePaiement: c.modePaiement,
  payee: c.payee,
  contact: {
    prenom: c.prenom,
    nom: c.nom,
    telephone: c.telephone,
    whatsapp: c.whatsapp,
    email: c.email,
  },
  note: c.note,
  annuleePar: c.annuleePar,
  motifAnnulation: c.motifAnnulation,
  creeLe: c.creeLe,
  traiteeLe: c.traiteeLe,
});

const toClientDto = (c: Commande): CommandeClienteDto => ({
  ...toDto(c),
  annulable: CLIENT_CANCELLABLE.includes(c.statut),
});

const toAdminDto = (c: Commande): CommandeAdminDto => ({
  ...toDto(c),
  compteId: c.compteId,
  payeeLe: c.payeeLe,
});

const ORDERS = {
  recentes: [['c.creeLe', 'DESC']],
  anciennes: [['c.creeLe', 'ASC']],
  'total-desc': [
    ['c.total', 'DESC'],
    ['c.creeLe', 'DESC'],
  ],
  nom: [
    ['c.nom', 'ASC'],
    ['c.prenom', 'ASC'],
  ],
} as const;

const settingsNotFound = () =>
  new NotFoundException(
    "Le salon n'est pas encore configuré : la boutique ne prend pas encore de commandes",
  );

@Injectable()
export class CommandesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Commande)
    private readonly commandes: Repository<Commande>,
    @InjectRepository(Settings)
    private readonly settings: Repository<Settings>,
  ) {}

  async create(
    compteId: string,
    dto: CreateCommandeDto,
  ): Promise<CommandeClienteDto> {
    const settings = await this.settings.findOneBy({ id: SETTINGS_ID });
    if (!settings) throw settingsNotFound();
    const delivery = resolveDelivery(settings, dto);
    const requestErrors = [
      ...duplicateLineErrors(dto.lignes),
      ...('errors' in delivery ? delivery.errors : []),
    ];
    if (requestErrors.length || 'errors' in delivery) {
      throw new BadRequestException(requestErrors);
    }

    const id = await this.dataSource.transaction(
      'READ COMMITTED',
      async (manager) => {
        // Verrou du compte : les commandes d'une même cliente passent une à une, la limite de
        // commandes en attente ne peut pas être contournée par des envois simultanés
        const account = await manager.findOne(Account, {
          where: { id: compteId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!account) {
          throw new UnauthorizedException(
            'Compte introuvable : reconnectez-vous pour commander',
          );
        }
        const pending = await manager.find(Commande, {
          select: { reference: true },
          where: { compteId, statut: 'en_attente' },
        });
        if (pending.length >= MAX_PENDING_ORDERS) {
          throw new ConflictException(
            `Vous avez déjà ${pending.length} commandes en attente (${pending.map((c) => c.reference).join(', ')}) : ` +
              'attendez que le salon les traite ou annulez-en une pour commander à nouveau',
          );
        }

        // Verrou des produits (stock lu puis décrémenté sans qu'une autre commande s'intercale)
        const products = await lockProducts(
          manager,
          dto.lignes.map((l) => l.produitId),
        );
        const resolved = resolveLines(dto.lignes, products);
        if ('errors' in resolved) {
          throw new BadRequestException(resolved.errors);
        }
        const { lignes } = resolved;
        const sousTotal = subtotal(lignes);
        const total = sousTotal + delivery.fraisLivraison;
        if (total !== dto.totalAttendu) {
          throw new ConflictException(
            `Le total de votre commande est maintenant de ${formatPrice(total)} ` +
              `(et non ${formatPrice(dto.totalAttendu)}) : un prix ou des frais de livraison ont changé, ` +
              'vérifiez votre panier avant de confirmer',
          );
        }

        await moveStock(manager, lignes, -1);
        const reference = await uniqueReference(manager);
        const commande = await manager.save(
          manager.create(Commande, {
            reference,
            compteId,
            statut: 'en_attente',
            lignes,
            sousTotal,
            fraisLivraison: delivery.fraisLivraison,
            total,
            mode: dto.mode,
            destination: delivery.destination,
            adresse: delivery.adresse,
            modePaiement: dto.modePaiement,
            payee: false,
            payeeLe: null,
            prenom: account.firstName,
            nom: account.lastName,
            telephone: account.phone,
            whatsapp: account.whatsapp,
            email: account.email,
            note: dto.note ?? '',
            annuleePar: null,
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
        return commande.id;
      },
    );
    return toClientDto(await this.commandes.findOneByOrFail({ id }));
  }

  // Commandes de la cliente connectée, la plus récente d'abord
  async listOwn(compteId: string): Promise<CommandeClienteDto[]> {
    const commandes = await this.commandes.find({
      where: { compteId },
      order: { creeLe: 'DESC' },
    });
    return commandes.map(toClientDto);
  }

  async cancelOwn(
    compteId: string,
    id: string,
    { motif }: CancelCommandeDto,
  ): Promise<CommandeClienteDto> {
    // Filtre sur le compte : la commande d'une autre cliente répond 404, comme si elle n'existait pas
    const commande = await this.cancel(
      { id, compteId },
      CLIENT_CANCELLABLE,
      'cliente',
      motif || null,
      () =>
        new NotFoundException(
          'Commande introuvable : elle n’existe pas ou n’est pas liée à votre compte',
        ),
    );
    return toClientDto(commande);
  }

  async list({
    statut,
    paiement,
    mode,
    q,
    tri,
    page,
    parPage,
  }: CommandesQueryDto): Promise<CommandesPageDto> {
    // Filtres communs à la page et aux compteurs par statut (qui ignorent le filtre de statut)
    const filtered = () => {
      const query = this.commandes.createQueryBuilder('c');
      if (paiement) {
        query
          .andWhere('c.payee = :payee', { payee: paiement === 'payees' })
          .andWhere("c.statut <> 'annulee'");
      }
      if (mode) query.andWhere('c.mode = :mode', { mode });
      const search = q && normalizeSearch(q);
      if (search) {
        query.andWhere('c.recherche LIKE :search', {
          search: `%${escapeLike(search)}%`,
        });
      }
      return query;
    };

    const query = filtered();
    if (statut) query.andWhere('c.statut = :statut', { statut });
    for (const [column, direction] of ORDERS[tri]) {
      query.addOrderBy(column, direction);
    }
    const [[commandes, total], counts] = await Promise.all([
      query
        .skip((page - 1) * parPage)
        .take(parPage)
        .getManyAndCount(),
      filtered()
        .select('c.statut', 'statut')
        .addSelect('COUNT(*)', 'n')
        .groupBy('c.statut')
        .getRawMany<{ statut: Statut; n: string }>(),
    ]);
    const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0])) as Record<
      Statut,
      number
    >;
    for (const { statut: s, n } of counts) parStatut[s] = Number(n);
    return {
      elements: commandes.map(toAdminDto),
      total,
      page,
      parPage,
      parStatut,
    };
  }

  async get(id: string): Promise<CommandeAdminDto> {
    return toAdminDto(await this.loadForAdmin(id));
  }

  async accept(id: string): Promise<CommandeAdminDto> {
    return toAdminDto(
      await this.transition(id, ['en_attente'], 'acceptée', {
        statut: 'en_preparation',
      }),
    );
  }

  async markReady(id: string): Promise<CommandeAdminDto> {
    return toAdminDto(
      await this.transition(
        id,
        ['en_preparation'],
        'marquée expédiée ou prête',
        { statut: 'prete' },
      ),
    );
  }

  // La remise vaut encaissement pour un paiement en espèces ; un Mobile Money non reçu reste à encaisser
  async deliver(id: string): Promise<CommandeAdminDto> {
    const commande = await this.loadForAdmin(id);
    const now = new Date();
    const cash = commande.modePaiement === 'especes' && !commande.payee;
    return toAdminDto(
      await this.transition(id, ['prete'], 'marquée livrée ou retirée', {
        statut: 'livree',
        ...(cash && { payee: true, payeeLe: now }),
      }),
    );
  }

  async markPaid(id: string): Promise<CommandeAdminDto> {
    const { affected } = await this.commandes.update(
      { id, payee: false, statut: Not('annulee') },
      { payee: true, payeeLe: new Date() },
    );
    const current = await this.loadForAdmin(id);
    if (!affected) {
      throw new ConflictException(
        current.statut === 'annulee'
          ? `La commande ${current.reference} a été annulée : elle ne peut pas être encaissée`
          : `La commande ${current.reference} est déjà marquée payée` +
              (current.payeeLe
                ? ` (le ${current.payeeLe.toLocaleDateString('fr-FR', { timeZone: 'UTC' })})`
                : ''),
      );
    }
    return toAdminDto(current);
  }

  async cancelBySalon(
    id: string,
    { motif }: AdminCancelCommandeDto,
  ): Promise<CommandeAdminDto> {
    const commande = await this.cancel(
      { id },
      SALON_CANCELLABLE,
      'salon',
      motif,
      () =>
        new NotFoundException(
          'Commande introuvable : elle n’existe pas ou l’identifiant est erroné',
        ),
    );
    return toAdminDto(commande);
  }

  private async loadForAdmin(id: string) {
    const commande = await this.commandes.findOneBy({ id });
    if (!commande) {
      throw new NotFoundException(
        'Commande introuvable : elle n’existe pas ou l’identifiant est erroné',
      );
    }
    return commande;
  }

  // Changement de statut atomique : la mise à jour n'aboutit que si le statut n'a pas changé
  // entre-temps ; sinon on relit pour dire ce qui s'est passé
  private async transition(
    id: string,
    from: Statut[],
    action: string,
    changes: Partial<Pick<Commande, 'statut' | 'payee' | 'payeeLe'>>,
  ) {
    const { affected } = await this.commandes.update(
      { id, statut: In(from) },
      { ...changes, traiteeLe: new Date() },
    );
    const current = await this.loadForAdmin(id);
    if (!affected) {
      throw new ConflictException(
        statusConflict(current.reference, current.statut, action),
      );
    }
    return current;
  }

  // Annulation et retour du stock dans la même transaction : la commande verrouillée ne peut pas
  // être annulée deux fois (stock rendu deux fois) ni avancer pendant ce temps
  private async cancel(
    where: { id: string; compteId?: string },
    from: Statut[],
    annuleePar: 'cliente' | 'salon',
    motif: string | null,
    notFound: () => NotFoundException,
  ) {
    const id = await this.dataSource.transaction(
      'READ COMMITTED',
      async (manager) => {
        const commande = await manager.findOne(Commande, {
          where,
          lock: { mode: 'pessimistic_write' },
        });
        if (!commande) throw notFound();
        if (!from.includes(commande.statut)) {
          throw new ConflictException(
            annuleePar === 'cliente' && commande.statut === 'en_preparation'
              ? `La commande ${commande.reference} est déjà en préparation : contactez le salon pour l’annuler`
              : statusConflict(commande.reference, commande.statut, 'annulée'),
          );
        }
        await manager.update(
          Commande,
          { id: commande.id },
          {
            statut: 'annulee',
            annuleePar,
            motifAnnulation: motif,
            traiteeLe: new Date(),
          },
        );
        await moveStock(manager, commande.lignes, +1);
        return commande.id;
      },
    );
    return this.commandes.findOneByOrFail({ id });
  }
}

/**
 * Produits (et leurs déclinaisons) verrouillés jusqu'à la fin de la transaction, toujours dans
 * l'ordre des identifiants pour que deux commandes croisées ne s'attendent pas mutuellement
 */
const lockProducts = async (
  manager: EntityManager,
  ids: string[],
): Promise<Map<string, CatalogProduct>> => {
  const unique = [...new Set(ids)].sort();
  if (!unique.length) return new Map();
  const products = await manager.find(Product, {
    where: { id: In(unique) },
    order: { id: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });
  const variants = await manager.find(ProductVariant, {
    where: { produitId: In(unique) },
    order: { produitId: 'ASC', position: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });
  return new Map(
    products.map((p) => [
      p.id,
      {
        id: p.id,
        nom: p.nom,
        prix: p.prix,
        stock: p.stock,
        masque: p.masque,
        declinaisons: variants
          .filter((v) => v.produitId === p.id)
          .map(({ id, nom, stock }) => ({ id, nom, stock })),
      },
    ]),
  );
};

/**
 * Retire (-1) ou rend (+1) le stock des lignes et incrémente la `version` des produits touchés,
 * pour qu'une fiche admin ouverte avant ne l'écrase pas. Au retour, un produit ou une déclinaison
 * supprimé depuis est ignoré (rien à rendre) ; une ligne sans déclinaison n'est rendue que si le
 * produit n'en a toujours pas
 */
const moveStock = async (
  manager: EntityManager,
  lignes: OrderLine[],
  direction: -1 | 1,
) => {
  const products = await lockProducts(
    manager,
    lignes.map((l) => l.produitId),
  );
  const touched = new Set<string>();
  for (const line of lignes) {
    const product = products.get(line.produitId);
    if (!product) continue;
    const delta = direction * line.quantite;
    if (line.declinaisonId) {
      const variant = product.declinaisons.find(
        (d) => d.id === line.declinaisonId,
      );
      if (!variant) continue;
      variant.stock += delta;
      await manager.update(
        ProductVariant,
        { id: variant.id },
        { stock: variant.stock },
      );
    } else {
      if (product.declinaisons.length) continue;
      product.stock += delta;
      await manager.update(
        Product,
        { id: product.id },
        { stock: product.stock },
      );
    }
    touched.add(product.id);
  }
  if (touched.size) {
    await manager.increment(Product, { id: In([...touched]) }, 'version', 1);
  }
};

// Référence unique : 32⁶ combinaisons, une collision est improbable mais vérifiée
const uniqueReference = async (manager: EntityManager) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    if (!(await manager.existsBy(Commande, { reference }))) return reference;
  }
  throw new InternalServerErrorException(
    'Impossible de générer une référence de commande : réessayez',
  );
};
