import { Body, Controller, Delete, Param, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
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
import {
  OrderDto,
  PrestationCategoryDto,
  SavePrestationCategoryDto,
  SavePrestationDto,
} from './dto/prestations.dto';
import { PrestationCategory } from './entities/prestation-category.entity';
import { Prestation } from './entities/prestation.entity';
import { PrestationsService } from './prestations.service';

// Les réponses contiennent toute la carte : la cible est nommée d'après le corps, ou lue avant une
// suppression
const categorie = ({ params, corps, avant }: ContexteJournal) => ({
  type: 'categorie_prestations' as const,
  id: params.id,
  libelle: avant ?? texte(corps?.nom),
});

const prestation = ({ params, corps, avant }: ContexteJournal) => ({
  type: 'prestation' as const,
  id: params.id,
  libelle: avant ?? texte(corps?.nom),
});

const Catalogue = (description = 'Carte à jour') =>
  ApiOkResponse({ type: [PrestationCategoryDto], description });

const NotFound = (description: string) =>
  ApiNotFoundResponse({ type: ErrorResponseDto, description });

const CategoryParam = () =>
  ApiParam({
    name: 'id',
    description: 'Identifiant de la catégorie',
    example: 'mains',
  });

const DuplicateName = () =>
  ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Une catégorie porte déjà ce nom (casse et accents ignorés)',
  });

const Created = () =>
  ApiCreatedResponse({
    type: [PrestationCategoryDto],
    description: 'Carte à jour',
  });

// Écrans Prestations › Catalogue et Prestations › Catégories ; chaque réponse contient toute la carte
@ApiTags('Admin : prestations')
@AdminOnly()
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Champs invalides',
})
@Controller('admin/prestations')
export class AdminPrestationsController {
  constructor(private readonly prestations: PrestationsService) {}

  @Post('categories')
  @Journaliser('prestation.categorie.ajoutee', { cible: categorie })
  @Created()
  @DuplicateName()
  @ApiOperation({
    summary: 'Ajouter une catégorie',
    description:
      'Placée en fin de liste. Son identifiant est tiré du nom (suffixé -2, -3… s’il est pris) et ne ' +
      'change plus ensuite, même si le nom change.',
  })
  createCategory(@Body() dto: SavePrestationCategoryDto) {
    return this.prestations.createCategory(dto);
  }

  // Déclarée avant `categories/:id` : « ordre » n'est jamais un identifiant de catégorie
  @Put('categories/ordre')
  @Journaliser('prestation.categories.ordonnees')
  @Catalogue()
  @ApiOperation({
    summary: 'Réordonner les catégories',
    description:
      'Liste de tous les identifiants de catégorie, dans le nouvel ordre d’affichage.',
  })
  orderCategories(@Body() dto: OrderDto) {
    return this.prestations.orderCategories(dto);
  }

  @Put('categories/:id')
  @Journaliser('prestation.categorie.modifiee', { cible: categorie })
  @CategoryParam()
  @Catalogue()
  @NotFound('Catégorie introuvable')
  @DuplicateName()
  @ApiOperation({
    summary: 'Modifier une catégorie',
    description: 'Nom et accroche ; l’identifiant ne change pas.',
  })
  updateCategory(
    @Param('id') id: string,
    @Body() dto: SavePrestationCategoryDto,
  ) {
    return this.prestations.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Journaliser('prestation.categorie.supprimee', {
    avant: nomAvant(PrestationCategory),
    cible: categorie,
  })
  @CategoryParam()
  @Catalogue()
  @NotFound('Catégorie introuvable')
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'La catégorie a encore des prestations',
  })
  @ApiOperation({ summary: 'Supprimer une catégorie vide' })
  removeCategory(@Param('id') id: string) {
    return this.prestations.removeCategory(id);
  }

  @Put('categories/:id/ordre')
  @Journaliser('prestations.ordonnees', {
    avant: nomAvant(PrestationCategory),
    cible: categorie,
  })
  @CategoryParam()
  @Catalogue()
  @NotFound('Catégorie introuvable')
  @ApiOperation({
    summary: 'Réordonner les prestations d’une catégorie',
    description:
      'Liste de tous les identifiants des prestations de la catégorie, dans le nouvel ordre d’affichage.',
  })
  orderPrestations(@Param('id') id: string, @Body() dto: OrderDto) {
    return this.prestations.orderPrestations(id, dto);
  }

  @Post()
  @Journaliser<PrestationCategoryDto[]>('prestation.ajoutee', {
    // Identifiant généré : la prestation est la dernière de sa catégorie dans la carte renvoyée
    cible: ({ corps, reponse }) => ({
      type: 'prestation',
      id: reponse?.find((c) => c.id === corps?.categorieId)?.prestations.at(-1)
        ?.id,
      libelle: texte(corps?.nom),
    }),
  })
  @Created()
  @ApiOperation({
    summary: 'Ajouter une prestation',
    description:
      'Placée en fin de sa catégorie (400 si la catégorie n’existe pas). Identifiant généré : slug du ' +
      'nom + 4 caractères aléatoires.',
  })
  createPrestation(@Body() dto: SavePrestationDto) {
    return this.prestations.createPrestation(dto);
  }

  @Put(':id')
  @Journaliser('prestation.modifiee', { cible: prestation })
  @ApiParam({ name: 'id', example: 'pose-mains-3f2a' })
  @Catalogue()
  @NotFound('Prestation introuvable')
  @ApiOperation({
    summary: 'Modifier une prestation',
    description:
      'Remplace nom, prix, prix d’appel et précision. Changer `categorieId` déplace la prestation en fin ' +
      'de la nouvelle catégorie. Les réservations déjà faites gardent le nom et le prix d’origine.',
  })
  updatePrestation(@Param('id') id: string, @Body() dto: SavePrestationDto) {
    return this.prestations.updatePrestation(id, dto);
  }

  @Delete(':id')
  @Journaliser('prestation.supprimee', {
    avant: nomAvant(Prestation),
    cible: prestation,
  })
  @ApiParam({ name: 'id', example: 'pose-mains-3f2a' })
  @Catalogue()
  @NotFound('Prestation introuvable')
  @ApiOperation({
    summary: 'Supprimer une prestation',
    description:
      'Les réservations déjà faites gardent le nom et le prix d’origine.',
  })
  removePrestation(@Param('id') id: string) {
    return this.prestations.removePrestation(id);
  }
}
