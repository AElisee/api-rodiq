import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import { VisitesJourDto, VisitesQueryDto } from './dto/visites.dto';
import { MAX_JOURS_PERIODE } from './visites.rules';
import { VisitesService } from './visites.service';

// Tableau de bord, en lecture seule : les visites sont comptées par `POST /visites`
@ApiTags('Admin : visites')
@AdminOnly()
@Controller('admin/visites')
export class AdminVisitesController {
  constructor(private readonly visites: VisitesService) {}

  @Get()
  @ApiOperation({
    summary: 'Visiteurs par jour',
    description:
      `Visiteurs uniques de chaque jour de la période (${MAX_JOURS_PERIODE} jours au plus), du plus ancien au ` +
      'plus récent. Les jours sans visiteur sont absents. Un visiteur revenu deux jours différents compte une ' +
      'fois chaque jour.',
  })
  @ApiOkResponse({ type: [VisitesJourDto] })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Dates invalides, inversées ou période trop longue',
  })
  list(@Query() query: VisitesQueryDto): Promise<VisitesJourDto[]> {
    return this.visites.list(query);
  }
}
