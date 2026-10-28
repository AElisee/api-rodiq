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
import { ClientOnly } from '../auth/sessions/auth.decorators';
import { CurrentSession } from '../auth/sessions/current-session.decorator';
import type { Session } from '../auth/sessions/session.entity';
import { ErrorResponseDto } from '../common/error-response.dto';
import { Journaliser, texte } from '../journal/journal.decorator';
import { MAX_PENDING_ORDERS } from './commandes.rules';
import { CommandesService } from './commandes.service';
import {
  CancelCommandeDto,
  CommandeClienteDto,
  CreateCommandeDto,
} from './dto/commandes.dto';

const cible = ({ reponse }: { reponse?: CommandeClienteDto }) => ({
  type: 'commande' as const,
  id: reponse?.id,
  libelle: reponse?.reference,
});

// Côté site : commande, suivi et annulation par la cliente connectée. Pas de commande sans
// compte : les e-mails ne sont pas vérifiés, rattacher des commandes par e-mail les exposerait
@ApiTags('Commandes')
@ClientOnly()
@Controller()
export class CommandesController {
  constructor(private readonly commandes: CommandesService) {}

  @Post('commandes')
  @Journaliser<CommandeClienteDto>('commande.creee', {
    cible,
    detail: ({ reponse }) => reponse && `${reponse.total} FCFA`,
  })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Passer commande',
    description:
      'Crée une commande `en_attente` pour la cliente connectée : coordonnées tirées de son compte, ' +
      'nom et prix des articles du catalogue, frais de livraison des réglages (figés ensuite). ' +
      'Le stock est retiré dans la même transaction et rendu à l’annulation. `totalAttendu` doit ' +
      `égaler le total recalculé. ${MAX_PENDING_ORDERS} commandes en attente au plus par compte.`,
  })
  @ApiCreatedResponse({ type: CommandeClienteDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Champs invalides, article masqué, supprimé, épuisé ou en quantité insuffisante, déclinaison ' +
      'manquante ou inconnue, destination non desservie (chaque écart listé)',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Total différent de `totalAttendu` (prix ou frais changés), ou trop de commandes en attente',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: "Le salon n'est pas encore configuré",
  })
  @ApiTooManyRequestsResponse({
    description: 'Trop de commandes, réessayer dans une minute',
  })
  create(
    @CurrentSession() session: Session,
    @Body() dto: CreateCommandeDto,
  ): Promise<CommandeClienteDto> {
    return this.commandes.create(session.userId, dto);
  }

  @Get('me/commandes')
  @ApiOperation({
    summary: 'Mes commandes',
    description: 'Commandes de la cliente connectée, la plus récente d’abord.',
  })
  @ApiOkResponse({ type: [CommandeClienteDto] })
  listOwn(@CurrentSession() session: Session): Promise<CommandeClienteDto[]> {
    return this.commandes.listOwn(session.userId);
  }

  @Post('me/commandes/:id/annuler')
  @Journaliser<CommandeClienteDto>('commande.annulee', {
    cible,
    detail: ({ corps }) => texte(corps?.motif),
  })
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Identifiant de la commande' })
  @ApiOperation({
    summary: 'Annuler ma commande',
    description:
      'Possible tant que la commande est en attente (préparation pas commencée). Le stock est rendu ; ' +
      'le motif est facultatif et transmis au salon.',
  })
  @ApiOkResponse({ type: CommandeClienteDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Champs invalides',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Commande inconnue ou liée à un autre compte',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Commande déjà en préparation, expédiée, livrée ou annulée',
  })
  cancel(
    @CurrentSession() session: Session,
    @Param('id') id: string,
    @Body() dto: CancelCommandeDto,
  ): Promise<CommandeClienteDto> {
    return this.commandes.cancelOwn(session.userId, id, dto);
  }
}
