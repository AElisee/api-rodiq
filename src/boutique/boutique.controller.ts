import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import {
  CategorieBoutiqueDto,
  ProduitPublicDto,
  ProduitsPublicsPageDto,
  ProduitsPublicsQueryDto,
} from './dto/boutique.dto';
import { ProductCategoriesService } from './product-categories.service';
import { ProductsService } from './products.service';

// Site public : jamais de produit masqué, jamais de stock exact (seulement `quantiteMax`, plafonnée)
@ApiTags('Boutique')
@Public()
// Lecture anonyme : limite large par adresse IP contre l'aspiration du catalogue
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@ApiTooManyRequestsResponse({
  type: ErrorResponseDto,
  description: 'Trop de requêtes depuis cette adresse',
})
@Controller('boutique')
export class BoutiqueController {
  constructor(
    private readonly categories: ProductCategoriesService,
    private readonly products: ProductsService,
  ) {}

  @Get('categories')
  @ApiOperation({
    summary: 'Catégories de la boutique',
    description:
      'Dans l’ordre d’affichage, seulement celles qui ont au moins un produit visible.',
  })
  @ApiOkResponse({ type: [CategorieBoutiqueDto] })
  categoriesList(): Promise<CategorieBoutiqueDto[]> {
    return this.categories.listPublic();
  }

  @Get('produits')
  @ApiOperation({
    summary: 'Produits de la boutique',
    description:
      'Produits visibles, filtrés par catégorie et recherche, triés et paginés. `sauf` exclut un ' +
      'produit (produits associés d’une fiche : `?categorie=…&sauf=…&parPage=4`).',
  })
  @ApiOkResponse({ type: ProduitsPublicsPageDto })
  list(
    @Query() query: ProduitsPublicsQueryDto,
  ): Promise<ProduitsPublicsPageDto> {
    return this.products.listPublic(query);
  }

  @Get('produits/:id')
  @ApiParam({ name: 'id', example: 'vernis-nude-rose-3f2a9c' })
  @ApiOperation({ summary: 'Fiche d’un produit' })
  @ApiOkResponse({ type: ProduitPublicDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Produit inconnu ou masqué',
  })
  get(@Param('id') id: string): Promise<ProduitPublicDto> {
    return this.products.getPublic(id);
  }

  @Get('photos/:id')
  @ApiParam({ name: 'id', description: 'Identifiant (UUID) de la photo' })
  @ApiOperation({
    summary: 'Photo d’un produit',
    description:
      'Image binaire (JPEG, PNG ou WebP), à utiliser directement dans `<img src>`. Une photo ne change ' +
      'jamais (une nouvelle photo a une nouvelle adresse) : mise en cache un an.',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Photo inconnue',
  })
  async photo(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { type, donnees } = await this.products.photoContent(id);
    res.set({
      // Affichée par le front, servi depuis une autre origine (helmet pose same-origin par défaut)
      'Cross-Origin-Resource-Policy': 'cross-origin',
      // Une image ouverte seule ne peut rien exécuter
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return new StreamableFile(donnees, {
      type,
      length: donnees.length,
      disposition: 'inline',
    });
  }
}
