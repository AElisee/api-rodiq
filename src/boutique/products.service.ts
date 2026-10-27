import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import {
  DataSource,
  In,
  type EntityManager,
  type Repository,
  type SelectQueryBuilder,
} from 'typeorm';
import type { OrderDto } from '../prestations/dto/prestations.dto';
import { orderErrors } from '../prestations/prestations.rules';
import {
  escapeLike,
  normalizeSearch,
} from '../reservations/reservations.rules';
import {
  decodePhoto,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  newProductId,
  newVariantId,
  productErrors,
  productLevel,
  publicQuantity,
  SEUIL_STOCK_FAIBLE_DEFAUT,
  stockLevel,
  variantErrors,
  type NiveauStock,
} from './boutique.rules';
import type {
  AddPhotoDto,
  AlerteStockDto,
  CreateProduitDto,
  ProduitAdminDto,
  ProduitCreeDto,
  ProduitPublicDto,
  ProduitsAdminPageDto,
  ProduitsAdminQueryDto,
  ProduitsPublicsPageDto,
  ProduitsPublicsQueryDto,
  UpdateProduitDto,
} from './dto/boutique.dto';
import { ProductCategory } from './entities/product-category.entity';
import { ProductPhoto } from './entities/product-photo.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';

// Même message qu'un produit masqué demandé par le site : on n'apprend pas qu'il existe
const productNotFound = () =>
  new NotFoundException(
    'Produit introuvable : il n’existe pas ou a été retiré de la boutique',
  );

const photoNotFound = () =>
  new NotFoundException(
    'Photo introuvable : elle n’existe pas ou a déjà été supprimée',
  );

export const photoUrl = (id: string) => `/api/boutique/photos/${id}`;

// Conditions SQL de niveau de stock (alias `p` = produits), mêmes règles que `productLevel`
const HAS_VARIANTS =
  'EXISTS (SELECT 1 FROM declinaisons_produits d WHERE d.produitId = p.id)';
const IS_OUT = `((NOT ${HAS_VARIANTS} AND p.stock = 0) OR EXISTS (SELECT 1 FROM declinaisons_produits d WHERE d.produitId = p.id AND d.stock = 0))`;
const IS_LOW_OR_OUT = `((NOT ${HAS_VARIANTS} AND p.stock <= p.seuilStockFaible) OR EXISTS (SELECT 1 FROM declinaisons_produits d WHERE d.produitId = p.id AND d.stock <= p.seuilStockFaible))`;
const LEVEL_CONDITIONS: Record<NiveauStock, string> = {
  epuise: IS_OUT,
  faible: `(${IS_LOW_OR_OUT} AND NOT ${IS_OUT})`,
  ok: `NOT ${IS_LOW_OR_OUT}`,
};
const TOTAL_STOCK =
  'COALESCE((SELECT SUM(d.stock) FROM declinaisons_produits d WHERE d.produitId = p.id), p.stock)';

@Injectable()
export class ProductsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductPhoto)
    private readonly photos: Repository<ProductPhoto>,
  ) {}

  // Le pilote envoie une photo en hexadécimal (2 caractères par octet) : une requête d'insertion
  // pèse le double de la photo. Sous ce seuil, MySQL/MariaDB refuserait les grandes photos
  async onApplicationBootstrap() {
    const [{ max }] = await this.dataSource.query<{ max: string }[]>(
      'SELECT @@max_allowed_packet AS max',
    );
    const needed = 2 * MAX_PHOTO_BYTES + 64 * 1024;
    if (Number(max) < needed) {
      this.logger.error(
        `max_allowed_packet vaut ${Math.round(Number(max) / 1024)} Ko : les photos de plus de ` +
          `${Math.floor((Number(max) - 64 * 1024) / 2048)} Ko seront refusées par la base. ` +
          'Régler max_allowed_packet = 16M dans la section [mysqld] de my.ini puis redémarrer MySQL',
      );
    }
  }

  // ───────────── Site ─────────────

  async listPublic(
    query: ProduitsPublicsQueryDto,
  ): Promise<ProduitsPublicsPageDto> {
    const qb = this.filtered(query).andWhere('p.masque = false');
    if (query.sauf) qb.andWhere('p.id <> :sauf', { sauf: query.sauf });
    if (query.tri === 'defaut') {
      qb.innerJoin('p.categorie', 'c')
        .orderBy('c.position', 'ASC')
        .addOrderBy('p.creeLe', 'ASC');
    } else {
      qb.orderBy('p.prix', query.tri === 'prix-asc' ? 'ASC' : 'DESC');
    }
    const { elements, total } = await this.page(qb, query.page, query.parPage);
    return {
      elements: elements.map((p) => this.toPublic(p)),
      total,
      page: query.page,
      parPage: query.parPage,
    };
  }

  async getPublic(id: string): Promise<ProduitPublicDto> {
    const product = await this.loadFull(id);
    if (!product || product.masque) throw productNotFound();
    return this.toPublic(product);
  }

  // Octets d'une photo, pour la route qui la sert
  async photoContent(id: string) {
    // Un identifiant mal formé ne désigne aucune photo : même réponse, sans requête
    if (!isUUID(id, '4')) throw photoNotFound();
    const photo = await this.photos
      .createQueryBuilder('ph')
      .addSelect('ph.donnees')
      .where('ph.id = :id', { id })
      .getOne();
    if (!photo) throw photoNotFound();
    return photo;
  }

  // ───────────── Admin : lecture ─────────────

  async listAdmin(query: ProduitsAdminQueryDto): Promise<ProduitsAdminPageDto> {
    const qb = this.filtered(query);
    if (query.visibilite) {
      qb.andWhere('p.masque = :masque', {
        masque: query.visibilite === 'masques',
      });
    }
    if (query.stock) qb.andWhere(LEVEL_CONDITIONS[query.stock]);
    switch (query.tri) {
      case 'nom':
        qb.orderBy('p.recherche', 'ASC');
        break;
      case 'prix-asc':
      case 'prix-desc':
        qb.orderBy('p.prix', query.tri === 'prix-asc' ? 'ASC' : 'DESC');
        break;
      case 'recent':
        qb.orderBy('p.creeLe', 'DESC');
        break;
      case 'stock':
        qb.addSelect(TOTAL_STOCK, 'stock_total').orderBy('stock_total', 'ASC');
        break;
      default:
        qb.innerJoin('p.categorie', 'c')
          .orderBy('c.position', 'ASC')
          .addOrderBy('p.creeLe', 'ASC');
    }
    const { elements, total } = await this.page(qb, query.page, query.parPage);
    return {
      elements: elements.map((p) => this.toAdmin(p)),
      total,
      page: query.page,
      parPage: query.parPage,
    };
  }

  async getAdmin(id: string): Promise<ProduitAdminDto> {
    const product = await this.loadFull(id);
    if (!product) throw productNotFound();
    return this.toAdmin(product);
  }

  // Produits ou déclinaisons épuisés ou sous leur seuil : épuisés d'abord, puis par stock croissant
  async stockAlerts(): Promise<AlerteStockDto[]> {
    const products = await this.products.find({
      relations: { declinaisons: true },
      order: { declinaisons: { position: 'ASC' } },
    });
    return products
      .flatMap((p) => {
        const entries = p.declinaisons.length
          ? p.declinaisons.map((d) => ({
              declinaisonId: d.id,
              declinaisonNom: d.nom,
              stock: d.stock,
            }))
          : [{ declinaisonId: null, declinaisonNom: null, stock: p.stock }];
        return entries.flatMap((entry) => {
          const niveau = stockLevel(entry.stock, p.seuilStockFaible);
          return niveau === 'ok'
            ? []
            : [{ produitId: p.id, produitNom: p.nom, ...entry, niveau }];
        });
      })
      .toSorted(
        (a, b) =>
          a.stock - b.stock || a.produitNom.localeCompare(b.produitNom, 'fr'),
      );
  }

  // ───────────── Admin : écriture ─────────────

  // Le produit est créé dès que ses champs sont valables ; les photos sont facultatives : celles qui
  // sont refusées sont écartées et expliquées dans `photosRefusees`, sans bloquer l'ajout
  async create(dto: CreateProduitDto): Promise<ProduitCreeDto> {
    const id = newProductId(dto.nom);
    // Décodées avant la transaction (CPU seulement). Les 4 places vont aux 4 premières photos
    // valables : une photo refusée ne prend pas la place d'une suivante ; au-delà, plus de décodage
    let valides = 0;
    const decoded = (dto.photos ?? []).map((image) => {
      if (valides >= MAX_PHOTOS) {
        return {
          error: `Photo écartée : ${MAX_PHOTOS} photos au plus par produit`,
        };
      }
      const photo = decodePhoto(image);
      if (!('error' in photo)) valides++;
      return photo;
    });
    const photosRefusees = decoded.flatMap((photo, i) =>
      'error' in photo ? [photo.error.replace(/^Photo/, `Photo ${i + 1}`)] : [],
    );
    await this.dataSource.transaction(async (manager) => {
      await this.assertValid(
        manager,
        dto,
        variantErrors(dto.declinaisons ?? [], []),
      );
      await manager.insert(Product, { id, ...this.columns(dto), version: 1 });
      await this.saveVariants(manager, id, dto, []);
    });
    // Après la création, une par une : une photo que la base refuse n'annule pas le produit
    let position = 0;
    for (const [i, photo] of decoded.entries()) {
      if ('error' in photo) continue;
      try {
        await this.photos.insert({
          produitId: id,
          type: photo.type,
          donnees: photo.data,
          octets: photo.data.length,
          position,
        });
        position++;
      } catch (error) {
        this.logger.error(
          `Photo ${i + 1} du produit ${id} non enregistrée`,
          error,
        );
        photosRefusees.push(
          `Photo ${i + 1} non enregistrée : la base de données l’a refusée ` +
            `(${Math.ceil(photo.data.length / 1024)} Ko), réessayez depuis la fiche du produit`,
        );
      }
    }
    return Object.assign(await this.getAdmin(id), { photosRefusees });
  }

  // Remplace tous les champs et les déclinaisons. Refusé (409) si la version envoyée n'est plus la
  // bonne : le stock a pu bouger (commande, autre onglet) et serait écrasé
  async update(id: string, dto: UpdateProduitDto): Promise<ProduitAdminDto> {
    await this.dataSource.transaction(async (manager) => {
      const product = await this.lock(manager, id);
      if (product.version !== dto.version) {
        throw new ConflictException(
          `« ${product.nom} » a été modifié entre-temps (stock vendu ou autre modification) : ` +
            'vos changements n’ont pas été enregistrés, rechargez la fiche',
        );
      }
      const existing = await manager.find(ProductVariant, {
        where: { produitId: id },
        select: { id: true },
      });
      await this.assertValid(
        manager,
        dto,
        variantErrors(
          dto.declinaisons ?? [],
          existing.map((v) => v.id),
        ),
      );
      await manager.update(
        Product,
        { id },
        { ...this.columns(dto), version: product.version + 1 },
      );
      await this.saveVariants(
        manager,
        id,
        dto,
        existing.map((v) => v.id),
      );
    });
    return this.getAdmin(id);
  }

  // Photos et déclinaisons partent avec le produit ; les commandes passées garderont nom et prix
  async remove(id: string) {
    const { affected } = await this.products.delete({ id });
    if (!affected) throw productNotFound();
  }

  async addPhoto(id: string, { image }: AddPhotoDto): Promise<ProduitAdminDto> {
    const photo = decodePhoto(image);
    if ('error' in photo) throw new BadRequestException([photo.error]);
    await this.dataSource.transaction(async (manager) => {
      // Verrou sur le produit : deux ajouts simultanés ne dépassent pas la limite
      const product = await this.lock(manager, id);
      const count = await manager.countBy(ProductPhoto, { produitId: id });
      if (count >= MAX_PHOTOS) {
        throw new ConflictException(
          `« ${product.nom} » a déjà ${MAX_PHOTOS} photos : retirez-en une avant d’en ajouter`,
        );
      }
      const max = await manager.maximum(ProductPhoto, 'position', {
        produitId: id,
      });
      await manager.insert(ProductPhoto, {
        produitId: id,
        type: photo.type,
        donnees: photo.data,
        octets: photo.data.length,
        position: (max ?? -1) + 1,
      });
    });
    return this.getAdmin(id);
  }

  async removePhoto(id: string, photoId: string): Promise<ProduitAdminDto> {
    if (!(await this.products.existsBy({ id }))) throw productNotFound();
    const { affected } = await this.photos.delete({
      id: photoId,
      produitId: id,
    });
    if (!affected) throw photoNotFound();
    return this.getAdmin(id);
  }

  async orderPhotos(id: string, { ids }: OrderDto): Promise<ProduitAdminDto> {
    if (!(await this.products.existsBy({ id }))) throw productNotFound();
    const photos = await this.photos.find({
      where: { produitId: id },
      order: { position: 'ASC' },
      select: { id: true },
    });
    const errors = orderErrors(
      ids,
      photos.map((p, i) => ({ id: p.id, nom: `photo ${i + 1}` })),
    );
    if (errors.length) {
      throw new BadRequestException([
        'Ordre non enregistré : la liste envoyée ne correspond pas aux photos du produit',
        ...errors,
      ]);
    }
    await this.dataSource.transaction(async (manager) => {
      for (const [position, photoId] of ids.entries()) {
        await manager.update(ProductPhoto, { id: photoId }, { position });
      }
    });
    return this.getAdmin(id);
  }

  // ───────────── Interne ─────────────

  // Filtres communs au site et à l'admin : catégorie et recherche dans le nom
  private filtered(query: { categorie?: string; q?: string }) {
    const qb = this.products.createQueryBuilder('p').select('p.id', 'id');
    if (query.categorie)
      qb.andWhere('p.categorieId = :categorie', { categorie: query.categorie });
    const search = query.q && normalizeSearch(query.q);
    if (search)
      qb.andWhere('p.recherche LIKE :search', {
        search: `%${escapeLike(search)}%`,
      });
    return qb;
  }

  // Page d'identifiants triés, puis produits complets dans cet ordre
  private async page(
    qb: SelectQueryBuilder<Product>,
    page: number,
    parPage: number,
  ) {
    const [rows, total] = await Promise.all([
      qb
        .clone()
        .addOrderBy('p.id', 'ASC')
        .offset((page - 1) * parPage)
        .limit(parPage)
        .getRawMany<{ id: string }>(),
      qb.clone().orderBy().getCount(),
    ]);
    const ids = rows.map((r) => r.id);
    const products = ids.length
      ? await this.products.find({
          where: { id: In(ids) },
          relations: { declinaisons: true, photos: true },
          order: {
            declinaisons: { position: 'ASC' },
            photos: { position: 'ASC' },
          },
        })
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return { elements: ids.flatMap((id) => byId.get(id) ?? []), total };
  }

  private loadFull(id: string) {
    return this.products.findOne({
      where: { id },
      relations: { declinaisons: true, photos: true },
      order: { declinaisons: { position: 'ASC' }, photos: { position: 'ASC' } },
    });
  }

  private async lock(manager: EntityManager, id: string) {
    const product = await manager.findOne(Product, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!product) throw productNotFound();
    return product;
  }

  // Tous les écarts d'un coup : cohérence prix / stock, déclinaisons et catégorie
  private async assertValid(
    manager: EntityManager,
    dto: CreateProduitDto,
    variantProblems: string[],
  ) {
    const errors = [
      ...productErrors({
        prix: dto.prix,
        prixBarre: dto.prixBarre,
        stock: dto.stock,
        declinaisons: dto.declinaisons ?? [],
      }),
      ...variantProblems,
    ];
    // Lue dans la transaction : la clé étrangère RESTRICT empêche sa suppression jusqu'à la fin
    if (!(await manager.existsBy(ProductCategory, { id: dto.categorieId }))) {
      errors.push(
        'La catégorie choisie n’existe pas ou a été supprimée : choisissez-en une autre',
      );
    }
    if (errors.length) throw new BadRequestException(errors);
  }

  private columns(dto: CreateProduitDto) {
    const hasVariants = !!dto.declinaisons?.length;
    return {
      categorieId: dto.categorieId,
      nom: dto.nom,
      prix: dto.prix,
      prixBarre: dto.prixBarre ?? null,
      description: dto.description ?? '',
      contenance: dto.contenance
        ? { valeur: dto.contenance.valeur, unite: dto.contenance.unite }
        : null,
      poids: dto.poids
        ? { valeur: dto.poids.valeur, unite: dto.poids.unite }
        : null,
      stock: hasVariants ? 0 : (dto.stock ?? 0),
      seuilStockFaible: dto.seuilStockFaible ?? SEUIL_STOCK_FAIBLE_DEFAUT,
      masque: dto.masque ?? false,
      recherche: normalizeSearch(dto.nom).slice(0, 80),
    };
  }

  // Déclinaisons envoyées : les existantes gardent leur identifiant, les autres sont créées,
  // les absentes supprimées
  private async saveVariants(
    manager: EntityManager,
    produitId: string,
    dto: CreateProduitDto,
    existingIds: string[],
  ) {
    const sent = dto.declinaisons ?? [];
    const kept = new Set(sent.flatMap((v) => (v.id ? [v.id] : [])));
    const removed = existingIds.filter((id) => !kept.has(id));
    if (removed.length)
      await manager.delete(ProductVariant, { id: In(removed) });
    for (const [position, { id, nom, stock }] of sent.entries()) {
      if (id)
        await manager.update(ProductVariant, { id }, { nom, stock, position });
      else
        await manager.insert(ProductVariant, {
          id: newVariantId(),
          produitId,
          nom,
          stock,
          position,
        });
    }
  }

  private base(p: Product) {
    return {
      id: p.id,
      categorieId: p.categorieId,
      nom: p.nom,
      prix: p.prix,
      prixBarre: p.prixBarre,
      description: p.description,
      contenance: p.contenance as ProduitPublicDto['contenance'],
      poids: p.poids as ProduitPublicDto['poids'],
      photos: p.photos.map((ph) => photoUrl(ph.id)),
    };
  }

  private toPublic(p: Product): ProduitPublicDto {
    const declinaisons = p.declinaisons.map((d) => ({
      id: d.id,
      nom: d.nom,
      quantiteMax: publicQuantity(d.stock),
    }));
    const quantiteMax = declinaisons.length
      ? Math.max(...declinaisons.map((d) => d.quantiteMax))
      : publicQuantity(p.stock);
    return {
      ...this.base(p),
      declinaisons,
      quantiteMax,
      epuise: quantiteMax === 0,
    };
  }

  private toAdmin(p: Product): ProduitAdminDto {
    return {
      ...this.base(p),
      declinaisons: p.declinaisons.map((d) => ({
        id: d.id,
        nom: d.nom,
        stock: d.stock,
        niveauStock: stockLevel(d.stock, p.seuilStockFaible),
      })),
      stock: p.stock,
      stockTotal: p.declinaisons.length
        ? p.declinaisons.reduce((sum, d) => sum + d.stock, 0)
        : p.stock,
      seuilStockFaible: p.seuilStockFaible,
      niveauStock: productLevel(p.stock, p.declinaisons, p.seuilStockFaible),
      masque: p.masque,
      photoIds: p.photos.map((ph) => ph.id),
      version: p.version,
      creeLe: p.creeLe,
      modifieLe: p.modifieLe,
    };
  }
}
