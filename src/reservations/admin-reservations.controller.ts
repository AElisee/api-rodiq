import {
  applyDecorators,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminOnly } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
import { Journaliser, texte } from '../journal/journal.decorator';
import {
  RejectReservationDto,
  ReservationAdminDto,
  ReservationsPageDto,
  ReservationsQueryDto,
} from './dto/reservations.dto';
import { ReservationsService } from './reservations.service';

const cible = ({ reponse }: { reponse?: ReservationAdminDto }) => ({
  type: 'reservation' as const,
  id: reponse?.id,
  libelle: reponse?.reference,
});

const ReservationParam = () =>
  ApiParam({ name: 'id', description: 'Identifiant de la réservation' });

const NotFound = () =>
  ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Réservation inconnue',
  });

// Changement de statut : renvoie la réservation à jour
const Transition = (conflict: string) =>
  applyDecorators(
    HttpCode(HttpStatus.OK),
    ReservationParam(),
    ApiOkResponse({
      type: ReservationAdminDto,
      description: 'Réservation à jour',
    }),
    NotFound(),
    ApiConflictResponse({ type: ErrorResponseDto, description: conflict }),
  );

// Écran Réservations de l'admin. Pas de modification ni de suppression : une réservation se
// refuse, et l'historique reste intact
@ApiTags('Admin : réservations')
@AdminOnly()
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Champs invalides',
})
@Controller('admin/reservations')
export class AdminReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Liste des réservations',
    description:
      'Filtrée par statut, période et recherche (nom, téléphones, e-mail, référence), triée et paginée. ' +
      '`parStatut` compte les réservations de chaque statut avec les autres filtres (pour les compteurs de l’écran).',
  })
  @ApiOkResponse({ type: ReservationsPageDto })
  list(@Query() query: ReservationsQueryDto): Promise<ReservationsPageDto> {
    return this.reservations.list(query);
  }

  @Get(':id')
  @ReservationParam()
  @ApiOperation({ summary: 'Détail d’une réservation' })
  @ApiOkResponse({ type: ReservationAdminDto })
  @NotFound()
  get(@Param('id') id: string): Promise<ReservationAdminDto> {
    return this.reservations.get(id);
  }

  @Post(':id/confirmer')
  @Transition(
    'La réservation n’est plus en attente, ou le rendez-vous est passé',
  )
  @ApiOperation({ summary: 'Confirmer une demande en attente' })
  @Journaliser('reservation.confirmee', { cible })
  confirm(@Param('id') id: string): Promise<ReservationAdminDto> {
    return this.reservations.confirm(id);
  }

  @Post(':id/refuser')
  @Transition(
    'La réservation est déjà refusée, annulée ou terminée, ou le rendez-vous est passé',
  )
  @ApiOperation({
    summary: 'Refuser une demande ou annuler un rendez-vous confirmé',
    description: 'Le motif est obligatoire et affiché à la cliente.',
  })
  @Journaliser('reservation.refusee', {
    cible,
    detail: ({ corps }) => texte(corps?.motif),
  })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectReservationDto,
  ): Promise<ReservationAdminDto> {
    return this.reservations.reject(id, dto);
  }

  @Post(':id/terminer')
  @Transition(
    'La réservation n’est pas confirmée, ou le rendez-vous est à une date future',
  )
  @ApiOperation({
    summary: 'Marquer le soin terminé',
    description: 'Pour un rendez-vous confirmé, le jour même ou après.',
  })
  @Journaliser('reservation.terminee', { cible })
  complete(@Param('id') id: string): Promise<ReservationAdminDto> {
    return this.reservations.complete(id);
  }
}
