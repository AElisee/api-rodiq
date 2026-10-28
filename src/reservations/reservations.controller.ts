import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ClientOnly, Public } from '../auth/sessions/auth.decorators';
import { CurrentSession } from '../auth/sessions/current-session.decorator';
import type { Session } from '../auth/sessions/session.entity';
import { ErrorResponseDto } from '../common/error-response.dto';
import {
  CancelReservationDto,
  CreateReservationDto,
  CreneauDto,
  ReservationClienteDto,
} from './dto/reservations.dto';
import { MAX_ACTIVE_RESERVATIONS } from './reservations.rules';
import { ReservationsService } from './reservations.service';

// Côté site : créneaux (public), puis réservation, liste et annulation par la cliente connectée
@ApiTags('Réservations')
@Controller()
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get('creneaux')
  @Public()
  @ApiOperation({
    summary: 'Créneaux réservables',
    description:
      'Créneaux de la fenêtre de réservation (horaires, pauses, fermetures et délai minimum appliqués), ' +
      'avec leurs places libres. Les créneaux complets sont inclus avec `placesRestantes: 0`.',
  })
  @ApiOkResponse({ type: [CreneauDto] })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: "Le salon n'est pas encore configuré",
  })
  slots(): Promise<CreneauDto[]> {
    return this.reservations.slots();
  }

  @Post('reservations')
  @ClientOnly()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Réserver un créneau',
    description:
      'Crée une demande `en_attente` pour la cliente connectée : ses coordonnées viennent de son compte, ' +
      'le nom et le prix des prestations de la carte (figés ensuite). Le créneau est revérifié ' +
      `(horaires, fermetures, fenêtre, délai minimum, places). ${MAX_ACTIVE_RESERVATIONS} réservations ` +
      'actives à venir au plus par compte.',
  })
  @ApiCreatedResponse({ type: ReservationClienteDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Champs invalides, prestation retirée de la carte ou créneau non réservable (raison précisée)',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Créneau complet, déjà réservé par la cliente, ou trop de réservations en cours',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: "Le salon n'est pas encore configuré",
  })
  @ApiTooManyRequestsResponse({
    description: 'Trop de demandes, réessayer dans une minute',
  })
  create(
    @CurrentSession() session: Session,
    @Body() dto: CreateReservationDto,
  ): Promise<ReservationClienteDto> {
    return this.reservations.create(session.userId, dto);
  }

  @Get('me/reservations')
  @ClientOnly()
  @ApiOperation({
    summary: 'Mes réservations',
    description:
      'Réservations de la cliente connectée, rendez-vous le plus récent d’abord.',
  })
  @ApiOkResponse({ type: [ReservationClienteDto] })
  listOwn(
    @CurrentSession() session: Session,
  ): Promise<ReservationClienteDto[]> {
    return this.reservations.listOwn(session.userId);
  }

  @Post('me/reservations/:id/annuler')
  @HttpCode(HttpStatus.OK)
  @ClientOnly()
  @ApiParam({ name: 'id', description: 'Identifiant de la réservation' })
  @ApiOperation({
    summary: 'Annuler ma réservation',
    description:
      'Possible pour une réservation en attente ou confirmée, au plus tard `dateLimiteAnnulation` ' +
      '(début du rendez-vous moins le délai d’annulation des réglages). Le motif est facultatif et transmis au salon.',
  })
  @ApiOkResponse({ type: ReservationClienteDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Champs invalides',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Réservation inconnue ou liée à un autre compte',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Déjà annulée, refusée ou terminée, ou délai d’annulation dépassé',
  })
  cancel(
    @CurrentSession() session: Session,
    @Param('id') id: string,
    @Body() dto: CancelReservationDto,
  ): Promise<ReservationClienteDto> {
    return this.reservations.cancel(session.userId, id, dto);
  }
}
