import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  OrderDto,
  PrestationCategoryDto,
  SavePrestationCategoryDto,
  SavePrestationDto,
} from './dto/prestations.dto';
import { PrestationCategory } from './entities/prestation-category.entity';
import { Prestation } from './entities/prestation.entity';
import {
  newCategoryId,
  newPrestationId,
  orderErrors,
  sameName,
} from './prestations.rules';

// Message de tête d'un ordre refusé, suivi d'une ligne par écart (voir `orderErrors`)
const orderRefused = (what: string, errors: string[]) =>
  new BadRequestException([
    `Ordre non enregistré : la liste envoyée ne correspond pas ${what} enregistrées`,
    ...errors,
  ]);

const prestationNotFound = () =>
  new NotFoundException(
    'Prestation introuvable : elle n’existe pas ou a déjà été supprimée',
  );

// Prochaine position en fin de liste (les suppressions laissent des trous, sans conséquence)
const nextPosition = (max: number | null) => (max ?? -1) + 1;

// Chaque écriture renvoie toute la carte, pour que le front remplace son état d'un coup
@Injectable()
export class PrestationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PrestationCategory)
    private readonly categories: Repository<PrestationCategory>,
    @InjectRepository(Prestation)
    private readonly prestations: Repository<Prestation>,
  ) {}

  // Catégories dans l'ordre d'affichage (vides comprises), chacune avec ses prestations dans l'ordre
  async list(): Promise<PrestationCategoryDto[]> {
    const categories = await this.categories.find({
      relations: { prestations: true },
      order: { position: 'ASC', prestations: { position: 'ASC' } },
    });
    return categories.map(({ id, nom, accroche, prestations }) => ({
      id,
      nom,
      accroche,
      prestations: prestations.map((p) => ({
        id: p.id,
        nom: p.nom,
        prix: p.prix,
        prixAPartirDe: p.prixAPartirDe,
        precision: p.precision,
      })),
    }));
  }

  // Prestations désignées par une réservation (les identifiants inconnus sont absents du résultat)
  findByIds(ids: string[]) {
    return this.prestations.findBy({ id: In(ids) });
  }

  async createCategory({ nom, accroche }: SavePrestationCategoryDto) {
    const categories = await this.categories.find();
    this.assertUniqueName(categories, nom);
    await this.categories.insert({
      id: newCategoryId(
        nom,
        categories.map((c) => c.id),
      ),
      nom,
      accroche: accroche ?? '',
      position: nextPosition(await this.categories.maximum('position')),
    });
    return this.list();
  }

  async updateCategory(
    id: string,
    { nom, accroche }: SavePrestationCategoryDto,
  ) {
    await this.loadCategory(id);
    const others = await this.categories.find();
    this.assertUniqueName(
      others.filter((c) => c.id !== id),
      nom,
    );
    await this.categories.update({ id }, { nom, accroche: accroche ?? '' });
    return this.list();
  }

  async removeCategory(id: string) {
    const category = await this.loadCategory(id);
    const count = await this.prestations.countBy({ categorieId: id });
    if (count) {
      throw new ConflictException(
        `La catégorie « ${category.nom} » contient encore ${count} prestation${count > 1 ? 's' : ''} : ` +
          'déplacez-les ou supprimez-les d’abord',
      );
    }
    await this.categories.delete({ id });
    return this.list();
  }

  async orderCategories({ ids }: OrderDto) {
    const categories = await this.categories.find({
      select: { id: true, nom: true },
    });
    const errors = orderErrors(ids, categories);
    if (errors.length) throw orderRefused('aux catégories', errors);
    await this.dataSource.transaction(async (manager) => {
      for (const [position, id] of ids.entries()) {
        await manager.update(PrestationCategory, { id }, { position });
      }
    });
    return this.list();
  }

  async createPrestation(dto: SavePrestationDto) {
    await this.assertCategoryExists(dto.categorieId);
    await this.prestations.insert({
      id: newPrestationId(dto.nom),
      ...this.prestationColumns(dto),
      position: await this.nextPrestationPosition(dto.categorieId),
    });
    return this.list();
  }

  // Changer de catégorie place la prestation en fin de sa nouvelle catégorie
  async updatePrestation(id: string, dto: SavePrestationDto) {
    const prestation = await this.prestations.findOneBy({ id });
    if (!prestation) throw prestationNotFound();
    await this.assertCategoryExists(dto.categorieId);
    await this.prestations.update(
      { id },
      {
        ...this.prestationColumns(dto),
        ...(dto.categorieId !== prestation.categorieId && {
          position: await this.nextPrestationPosition(dto.categorieId),
        }),
      },
    );
    return this.list();
  }

  async removePrestation(id: string) {
    const { affected } = await this.prestations.delete({ id });
    if (!affected) throw prestationNotFound();
    return this.list();
  }

  async orderPrestations(categoryId: string, { ids }: OrderDto) {
    await this.loadCategory(categoryId);
    const prestations = await this.prestations.find({
      select: { id: true, nom: true },
      where: { categorieId: categoryId },
    });
    const errors = orderErrors(ids, prestations);
    if (errors.length) {
      throw orderRefused('aux prestations de la catégorie', errors);
    }
    await this.dataSource.transaction(async (manager) => {
      for (const [position, id] of ids.entries()) {
        await manager.update(Prestation, { id }, { position });
      }
    });
    return this.list();
  }

  private async loadCategory(id: string) {
    const category = await this.categories.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(
        'Catégorie introuvable : elle n’existe pas ou a déjà été supprimée',
      );
    }
    return category;
  }

  // Catégorie désignée dans le corps : une valeur invalide, pas une ressource absente de l'URL
  private async assertCategoryExists(id: string) {
    if (!(await this.categories.existsBy({ id }))) {
      throw new BadRequestException([
        'La catégorie choisie n’existe pas ou a été supprimée : choisissez-en une autre',
      ]);
    }
  }

  private assertUniqueName(categories: PrestationCategory[], nom: string) {
    const existing = categories.find((c) => sameName(c.nom, nom));
    if (existing) {
      throw new ConflictException(
        `La catégorie « ${existing.nom} » existe déjà (majuscules et accents ne comptent pas)`,
      );
    }
  }

  private async nextPrestationPosition(categorieId: string) {
    return nextPosition(
      await this.prestations.maximum('position', { categorieId }),
    );
  }

  private prestationColumns(dto: SavePrestationDto) {
    return {
      categorieId: dto.categorieId,
      nom: dto.nom,
      prix: dto.prix,
      prixAPartirDe: dto.prixAPartirDe ?? false,
      precision: dto.precision ?? '',
    };
  }
}
