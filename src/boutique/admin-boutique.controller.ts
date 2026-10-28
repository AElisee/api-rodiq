import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import {
  type ContexteJournal,
  Journaliser,
  nomAvant,
  texte,
} from '../journal/journal.decorator';
import { OrderDto } from '../prestations/dto/prestations.dto';
import {
  AddPhotoDto,
  AlerteStockDto,
  CategorieBoutiqueAdminDto,
  CreateProduitDto,
  ProduitAdminDto,
  ProduitCreeDto,
  ProduitsAdminPageDto,
  ProduitsAdminQueryDto,
  SaveCategorieBoutiqueDto,
  UpdateProduitDto,
} from './dto/boutique.dto';
import { ProductCategory } from './entities/product-category.entity';
import { Product } from './entities/product.entity';
import { ProductCategoriesService } from './product-categories.service';
import { ProductsService } from './products.service';

const NotFound = (description: string) =>
  ApiNotFoundResponse({ type: ErrorResponseDto, description });

const Categories = () =>
  ApiOkResponse({
    type: [CategorieBoutiqueAdminDto],
    description: 'Catégories à jour',
  });

const CategoryParam = () =>
  ApiParam({
    name: 'id',
    description: 'Identifiant de la catégorie',
    example: 'vernis',
  });

const DuplicateName = () =>
  ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Une catégorie porte déjà ce nom (casse et accents ignorés)',
  });

const ProductParam = () =>
  ApiParam({ name: 'id', example: 'vernis-nude-rose-3f2a9c' });

const UpdatedProduct = () =>
  ApiOkResponse({ type: ProduitAdminDto, description: 'Produit à jour' });

const categorie = ({ params, corps, avant }: ContexteJournal) => ({
  type: 'categorie_produits' as const,
  id: params.id,
  libelle: avant ?? texte(corps?.nom),
});

// Les routes produit renvoient le produit, sauf la suppression : nom lu avant
const produit = ({
  params,
  reponse,
  avant,
}: ContexteJournal<ProduitAdminDto | undefined>) => ({
  type: 'produit' as const,
  id: reponse?.id ?? params.id,
  libelle: reponse?.nom ?? avant,
});

// Écrans Boutique › Catégories et Boutique › Produits
@ApiTags('Admin : boutique')
@AdminOnly()
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Champs invalides (un message par écart)',
})
@Controller('admin/boutique')
export class AdminBoutiqueController {
  constructor(
    private readonly categories: ProductCategoriesService,
    private readonly products: ProductsService,
  ) {}

  // ───────────── Catégories ─────────────

  @Get('categories')
  @Categories()
  @ApiOperation({
    summary: 'Catégories (toutes)',
    description:
      'Dans l’ordre d’affichage, vides comprises, avec leur nombre de produits (masqués compris).',
  })
  categoriesList() {
    return this.categories.listAdmin();
  }

  @Post('categories')
  @Journaliser('boutique.categorie.ajoutee', { cible: categorie })
  @ApiCreatedResponse({
    type: [CategorieBoutiqueAdminDto],
    description: 'Catégories à jour',
  })
  @DuplicateName()
  @ApiOperation({
    summary: 'Ajouter une catégorie',
    description:
      'Placée en fin de liste. Son identifiant est tiré du nom (suffixé -2, -3… s’il est pris) et ne ' +
      'change plus ensuite.',
  })
  createCategory(@Body() dto: SaveCategorieBoutiqueDto) {
    return this.categories.create(dto);
  }

  // Déclarée avant `categories/:id` : « ordre » n'est jamais un identifiant de catégorie
  @Put('categories/ordre')
  @Journaliser('boutique.categories.ordonnees')
  @Categories()
  @ApiOperation({
    summary: 'Réordonner les catégories',
    description: 'Tous les identifiants de catégorie, dans le nouvel ordre.',
  })
  orderCategories(@Body() dto: OrderDto) {
    return this.categories.order(dto);
  }

  @Put('categories/:id')
  @Journaliser('boutique.categorie.modifiee', { cible: categorie })
  @CategoryParam()
  @Categories()
  @NotFound('Catégorie introuvable')
  @DuplicateName()
  @ApiOperation({
    summary: 'Modifier une catégorie',
    description: 'Nom et description ; l’identifiant ne change pas.',
  })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: SaveCategorieBoutiqueDto,
  ) {
    return this.categories.update(id, dto);
  }

  @Delete('categories/:id')
  @Journaliser('boutique.categorie.supprimee', {
    avant: nomAvant(ProductCategory),
    cible: categorie,
  })
  @CategoryParam()
  @Categories()
  @NotFound('Catégorie introuvable')
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'La catégorie a encore des produits (masqués compris)',
  })
  @ApiOperation({ summary: 'Supprimer une catégorie vide' })
  removeCategory(@Param('id') id: string) {
    return this.categories.remove(id);
  }

  // ───────────── Produits ─────────────

  @Get('alertes-stock')
  @ApiOperation({
    summary: 'Alertes de stock',
    description:
      'Produits sans déclinaison et déclinaisons épuisés ou sous le seuil d’alerte de leur produit ' +
      '(masqués compris), du stock le plus bas au plus haut. Pour le tableau de bord et la pastille du menu.',
  })
  @ApiOkResponse({ type: [AlerteStockDto] })
  stockAlerts() {
    return this.products.stockAlerts();
  }

  @Get('produits')
  @ApiOperation({
    summary: 'Liste des produits',
    description:
      'Tous les produits (masqués compris), filtrés par catégorie, recherche, niveau de stock et ' +
      'visibilité, triés et paginés.',
  })
  @ApiOkResponse({ type: ProduitsAdminPageDto })
  list(@Query() query: ProduitsAdminQueryDto) {
    return this.products.listAdmin(query);
  }

  @Get('produits/:id')
  @ProductParam()
  @ApiOperation({ summary: 'Fiche d’un produit' })
  @ApiOkResponse({ type: ProduitAdminDto })
  @NotFound('Produit introuvable')
  get(@Param('id') id: string) {
    return this.products.getAdmin(id);
  }

  @Post('produits')
  @Journaliser<ProduitCreeDto>('produit.ajoute', {
    cible: produit,
    detail: ({ reponse }) => reponse?.photosRefusees.join(' ; '),
  })
  @ApiCreatedResponse({
    type: ProduitCreeDto,
    description:
      'Produit créé, avec les photos acceptées ; `photosRefusees` explique celles qui ont été écartées',
  })
  @ApiOperation({
    summary: 'Ajouter un produit',
    description:
      'Identifiant généré (slug du nom + 6 caractères aléatoires). Soit `stock` (sans déclinaison), ' +
      'soit `declinaisons` chacune avec son stock. `photos` est facultatif : 0 à 4 data URL JPEG, PNG ' +
      'ou WebP (600 Ko chacune, signature vérifiée). Une photo refusée ne bloque pas l’ajout : le ' +
      'produit est créé avec les photos valables, et `photosRefusees` liste les autres (numéro et ' +
      'raison). Seuls les champs du produit peuvent refuser l’ajout (400). Corps limité à 4 Mo sur ' +
      'cette route (1 Mo ailleurs). Photos d’un produit existant : routes `…/:id/photos`.',
  })
  create(@Body() dto: CreateProduitDto) {
    return this.products.create(dto);
  }

  @Put('produits/:id')
  @Journaliser('produit.modifie', { cible: produit })
  @ProductParam()
  @UpdatedProduct()
  @NotFound('Produit introuvable')
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Le produit a changé depuis sa lecture (`version` dépassée) : rien n’est enregistré',
  })
  @ApiOperation({
    summary: 'Modifier un produit',
    description:
      'Remplace tous les champs et la liste des déclinaisons (sans les photos). Une déclinaison ' +
      'existante est désignée par son `id` et le garde ; sans `id` elle est créée ; absente, elle est ' +
      'supprimée. `version` doit être celle de la dernière lecture.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateProduitDto) {
    return this.products.update(id, dto);
  }

  @Delete('produits/:id')
  @Journaliser('produit.supprime', { avant: nomAvant(Product), cible: produit })
  @ProductParam()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Produit supprimé avec ses photos' })
  @NotFound('Produit introuvable')
  @ApiOperation({
    summary: 'Supprimer un produit',
    description:
      'Supprime aussi ses déclinaisons et photos. Pour le retirer du site sans le perdre, le masquer.',
  })
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }

  @Post('produits/:id/photos')
  @Journaliser('produit.photo.ajoutee', { cible: produit })
  @ProductParam()
  @HttpCode(HttpStatus.OK)
  @UpdatedProduct()
  @NotFound('Produit introuvable')
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Le produit a déjà 4 photos',
  })
  @ApiOperation({
    summary: 'Ajouter une photo',
    description:
      'Data URL JPEG, PNG ou WebP (600 Ko au plus une fois décodée), placée en dernier. Le contenu ' +
      'doit correspondre au type annoncé (signature vérifiée) ; SVG refusé.',
  })
  addPhoto(@Param('id') id: string, @Body() dto: AddPhotoDto) {
    return this.products.addPhoto(id, dto);
  }

  // Déclarée avant `photos/:photoId`
  @Put('produits/:id/photos/ordre')
  @Journaliser('produit.photos.ordonnees', { cible: produit })
  @ProductParam()
  @UpdatedProduct()
  @NotFound('Produit introuvable')
  @ApiOperation({
    summary: 'Réordonner les photos',
    description:
      'Tous les `photoIds` du produit ; la première devient le visuel principal.',
  })
  orderPhotos(@Param('id') id: string, @Body() dto: OrderDto) {
    return this.products.orderPhotos(id, dto);
  }

  @Delete('produits/:id/photos/:photoId')
  @Journaliser('produit.photo.retiree', { cible: produit })
  @ProductParam()
  @ApiParam({ name: 'photoId', description: 'Identifiant (UUID) de la photo' })
  @UpdatedProduct()
  @NotFound('Produit ou photo introuvable')
  @ApiOperation({ summary: 'Retirer une photo' })
  removePhoto(@Param('id') id: string, @Param('photoId') photoId: string) {
    return this.products.removePhoto(id, photoId);
  }
}
