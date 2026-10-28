import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import { ComptesService } from './comptes.service';
import {
  CompteClientDetailDto,
  ComptesPageDto,
  ComptesQueryDto,
} from './dto/comptes.dto';

// Écran Clientèle de l'admin, en lecture seule : un compte se crée par l'inscription sur le site,
// et ne se supprime pas tant qu'il a des réservations ou des commandes (historique conservé)
@ApiTags('Admin : clientèle')
@AdminOnly()
@Controller('admin/comptes')
export class AdminComptesController {
  constructor(private readonly comptes: ComptesService) {}

  @Get()
  @ApiOperation({
    summary: 'Comptes clients avec leur activité',
    description:
      'Recherche (nom, téléphones, e-mail), tri et pagination. Chaque compte porte son nombre de réservations, ' +
      'la date de la plus récente, son nombre de commandes et ses dépenses estimées.',
  })
  @ApiOkResponse({ type: ComptesPageDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Paramètres invalides',
  })
  list(@Query() query: ComptesQueryDto): Promise<ComptesPageDto> {
    return this.comptes.list(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'Identifiant du compte' })
  @ApiOperation({
    summary: 'Fiche d’un compte',
    description:
      'Activité du compte et historique complet : réservations et commandes, de la plus récente à la plus ancienne.',
  })
  @ApiOkResponse({ type: CompteClientDetailDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Compte inconnu',
  })
  get(@Param('id') id: string): Promise<CompteClientDetailDto> {
    return this.comptes.get(id);
  }
}
