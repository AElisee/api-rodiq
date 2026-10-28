import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { SESSION_COOKIES } from '../auth/auth.constants';
import { Public } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import { estRobot } from './visites.rules';
import { VisitesService } from './visites.service';

@ApiTags('Visites')
@Controller('visites')
export class VisitesController {
  constructor(private readonly visites: VisitesService) {}

  @Post()
  @Public()
  @HttpCode(204)
  // Limite large : derrière un opérateur mobile, beaucoup de téléphones partagent la même adresse IP
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Signaler une visite du site',
    description:
      'Appelé par le site public à l’arrivée d’un visiteur. Chaque personne est comptée une fois par jour, ' +
      'reconnue par une empreinte anonyme (hachage de l’IP et du navigateur avec un sel changé chaque jour) : ' +
      'aucun cookie posé, aucune IP stockée. Ne sont pas comptés : les robots et les navigateurs connectés à ' +
      'l’admin. Répond 204 dans tous les cas, compté ou non.',
  })
  @ApiNoContentResponse({ description: 'Visite reçue' })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Trop de requêtes depuis cette adresse',
  })
  async compter(@Req() req: Request): Promise<void> {
    const userAgent = req.headers['user-agent'];
    // Simple présence du cookie : le salon qui consulte son propre site ne gonfle pas les chiffres
    const admin = !!req.cookies?.[SESSION_COOKIES.admin];
    if (!req.ip || !userAgent || admin || estRobot(userAgent)) return;
    await this.visites.compter(req.ip, userAgent);
  }
}
