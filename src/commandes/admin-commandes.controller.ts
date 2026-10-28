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
import { CommandesService } from './commandes.service';
import {
  AdminCancelCommandeDto,
  CommandeAdminDto,
  CommandesPageDto,
  CommandesQueryDto,
} from './dto/commandes.dto';

const cible = ({ reponse }: { reponse?: CommandeAdminDto }) => ({
  type: 'commande' as const,
  id: reponse?.id,
  libelle: reponse?.reference,
});

const CommandeParam = () =>
  ApiParam({ name: 'id', description: 'Identifiant de la commande' });

const NotFound = () =>
  ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Commande inconnue',
  });

// Changement de statut : renvoie la commande à jour
const Transition = (conflict: string) =>
  applyDecorators(
    HttpCode(HttpStatus.OK),
    CommandeParam(),
    ApiOkResponse({ type: CommandeAdminDto, description: 'Commande à jour' }),
    NotFound(),
    ApiConflictResponse({ type: ErrorResponseDto, description: conflict }),
  );

// Écran Commandes de l'admin. Pas de modification ni de suppression : une commande s'annule
// (stock rendu) et l'historique reste intact
@ApiTags('Admin : commandes')
@AdminOnly()
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Champs invalides',
})
@Controller('admin/commandes')
export class AdminCommandesController {
  constructor(private readonly commandes: CommandesService) {}

  @Get()
  @ApiOperation({
    summary: 'Liste des commandes',
    description:
      'Filtrée par statut, paiement, mode de remise et recherche (nom, téléphones, e-mail, référence), ' +
      'triée et paginée. `parStatut` compte les commandes de chaque statut avec les autres filtres.',
  })
  @ApiOkResponse({ type: CommandesPageDto })
  list(@Query() query: CommandesQueryDto): Promise<CommandesPageDto> {
    return this.commandes.list(query);
  }

  @Get(':id')
  @CommandeParam()
  @ApiOperation({ summary: 'Détail d’une commande' })
  @ApiOkResponse({ type: CommandeAdminDto })
  @NotFound()
  get(@Param('id') id: string): Promise<CommandeAdminDto> {
    return this.commandes.get(id);
  }

  @Post(':id/accepter')
  @Transition('La commande n’est plus en attente')
  @ApiOperation({ summary: 'Accepter une commande (préparation)' })
  @Journaliser('commande.acceptee', { cible })
  accept(@Param('id') id: string): Promise<CommandeAdminDto> {
    return this.commandes.accept(id);
  }

  @Post(':id/prete')
  @Transition('La commande n’est pas en préparation')
  @ApiOperation({
    summary: 'Marquer la commande expédiée (livraison) ou prête au retrait',
  })
  @Journaliser('commande.prete', { cible })
  markReady(@Param('id') id: string): Promise<CommandeAdminDto> {
    return this.commandes.markReady(id);
  }

  @Post(':id/remise')
  @Transition('La commande n’est pas expédiée ou prête au retrait')
  @ApiOperation({
    summary: 'Marquer la commande livrée ou retirée',
    description:
      'Un paiement en espèces est alors marqué encaissé ; un Mobile Money non reçu reste à encaisser.',
  })
  @Journaliser('commande.remise', { cible })
  deliver(@Param('id') id: string): Promise<CommandeAdminDto> {
    return this.commandes.deliver(id);
  }

  @Post(':id/encaisser')
  @Transition('Commande déjà payée ou annulée')
  @ApiOperation({ summary: 'Marquer le paiement reçu' })
  @Journaliser<CommandeAdminDto>('commande.encaissee', {
    cible,
    detail: ({ reponse }) => reponse && `${reponse.total} FCFA`,
  })
  markPaid(@Param('id') id: string): Promise<CommandeAdminDto> {
    return this.commandes.markPaid(id);
  }

  @Post(':id/annuler')
  @Transition('La commande est déjà expédiée, livrée ou annulée')
  @ApiOperation({
    summary: 'Annuler une commande',
    description:
      'Possible en attente ou en préparation ; le stock est rendu. Le motif est obligatoire et ' +
      'affiché à la cliente. Une commande déjà payée reste marquée payée (remboursement à prévoir).',
  })
  @Journaliser('commande.annulee', {
    cible,
    detail: ({ corps }) => texte(corps?.motif),
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: AdminCancelCommandeDto,
  ): Promise<CommandeAdminDto> {
    return this.commandes.cancelBySalon(id, dto);
  }
}
