import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { OrderDto } from '../prestations/dto/prestations.dto';
import { orderErrors, sameName } from '../prestations/prestations.rules';
import { newProductCategoryId } from './boutique.rules';
import type {
  CategorieBoutiqueAdminDto,
  CategorieBoutiqueDto,
  SaveCategorieBoutiqueDto,
} from './dto/boutique.dto';
import { ProductCategory } from './entities/product-category.entity';
import { Product } from './entities/product.entity';

// Catégories de la boutique. Chaque écriture admin renvoie toute la liste (avec le nombre de produits)
@Injectable()
export class ProductCategoriesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProductCategory)
    private readonly categories: Repository<ProductCategory>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
  ) {}

  // Site : seulement les catégories qui ont au moins un produit visible, dans l'ordre d'affichage
  async listPublic(): Promise<CategorieBoutiqueDto[]> {
    const categories = await this.categories
      .createQueryBuilder('c')
      .where(
        'EXISTS (SELECT 1 FROM produits p WHERE p.categorieId = c.id AND p.masque = false)',
      )
      .orderBy('c.position', 'ASC')
      .getMany();
    return categories.map(({ id, nom, description }) => ({
      id,
      nom,
      description,
    }));
  }

  // Admin : toutes les catégories (vides comprises) avec leur nombre de produits, masqués compris
  async listAdmin(): Promise<CategorieBoutiqueAdminDto[]> {
    const [categories, counts] = await Promise.all([
      this.categories.find({ order: { position: 'ASC' } }),
      this.products
        .createQueryBuilder('p')
        .select('p.categorieId', 'categorieId')
        .addSelect('COUNT(*)', 'nombre')
        .groupBy('p.categorieId')
        .getRawMany<{ categorieId: string; nombre: string }>(),
    ]);
    const byCategory = new Map(
      counts.map((c) => [c.categorieId, Number(c.nombre)]),
    );
    return categories.map(({ id, nom, description }) => ({
      id,
      nom,
      description,
      nombreProduits: byCategory.get(id) ?? 0,
    }));
  }

  async create({ nom, description }: SaveCategorieBoutiqueDto) {
    const categories = await this.categories.find();
    this.assertUniqueName(categories, nom);
    await this.categories.insert({
      id: newProductCategoryId(
        nom,
        categories.map((c) => c.id),
      ),
      nom,
      description: description ?? '',
      position: ((await this.categories.maximum('position')) ?? -1) + 1,
    });
    return this.listAdmin();
  }

  async update(id: string, { nom, description }: SaveCategorieBoutiqueDto) {
    await this.load(id);
    const others = await this.categories.find();
    this.assertUniqueName(
      others.filter((c) => c.id !== id),
      nom,
    );
    await this.categories.update(
      { id },
      { nom, description: description ?? '' },
    );
    return this.listAdmin();
  }

  async remove(id: string) {
    const category = await this.load(id);
    const count = await this.products.countBy({ categorieId: id });
    if (count) {
      throw new ConflictException(
        `La catégorie « ${category.nom} » contient encore ${count} produit${count > 1 ? 's' : ''} ` +
          '(masqués compris) : déplacez-les ou supprimez-les d’abord',
      );
    }
    // La clé étrangère RESTRICT bloque aussi un produit ajouté entre-temps
    await this.categories.delete({ id });
    return this.listAdmin();
  }

  async order({ ids }: OrderDto) {
    const categories = await this.categories.find({
      select: { id: true, nom: true },
    });
    const errors = orderErrors(ids, categories);
    if (errors.length) {
      throw new BadRequestException([
        'Ordre non enregistré : la liste envoyée ne correspond pas aux catégories enregistrées',
        ...errors,
      ]);
    }
    await this.dataSource.transaction(async (manager) => {
      for (const [position, id] of ids.entries()) {
        await manager.update(ProductCategory, { id }, { position });
      }
    });
    return this.listAdmin();
  }

  private async load(id: string) {
    const category = await this.categories.findOneBy({ id });
    if (!category) {
      throw new NotFoundException(
        'Catégorie introuvable : elle n’existe pas ou a déjà été supprimée',
      );
    }
    return category;
  }

  private assertUniqueName(categories: ProductCategory[], nom: string) {
    const existing = categories.find((c) => sameName(c.nom, nom));
    if (existing) {
      throw new ConflictException(
        `La catégorie « ${existing.nom} » existe déjà (majuscules et accents ne comptent pas)`,
      );
    }
  }
}
