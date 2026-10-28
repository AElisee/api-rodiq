import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JournalPageDto, JournalQueryDto } from './dto/journal.dto';
import { CONSERVATION_JOURS } from './journal.rules';
import { JournalService } from './journal.service';

// Écran Journal de l'admin, en lecture seule : les entrées sont écrites par l'API elle-même
// (`@Journaliser` sur chaque route d'écriture) et ne se modifient ni ne se suppriment
@ApiTags('Admin : journal')
@AdminOnly()
@Controller('admin/journal')
export class AdminJournalController {
  constructor(private readonly journal: JournalService) {}

  @Get()
  @ApiOperation({
    summary: 'Journal d’activité',
    description:
      'Connexions (réussies et refusées), inscriptions, déconnexions et toutes les actions qui modifient ' +
      'les données : réservations et commandes (création, annulation, changements de statut), boutique, ' +
      'prestations et réglages. Chaque entrée porte son auteur, l’élément touché, l’adresse IP et le ' +
      'navigateur. Filtré, du plus récent au plus ancien, paginé ; `parCategorie` compte les entrées de ' +
      'chaque catégorie avec les autres filtres, `jours` liste les jours ayant des entrées (une page ' +
      'd’écran par jour, lue avec `jour`). ' +
      `Conservé ${CONSERVATION_JOURS} jours.`,
  })
  @ApiOkResponse({ type: JournalPageDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Filtres invalides ou période inversée',
  })
  list(@Query() query: JournalQueryDto): Promise<JournalPageDto> {
    return this.journal.list(query);
  }
}
