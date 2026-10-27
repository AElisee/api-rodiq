import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Put,
} from '@nestjs/common';
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
import {
  BookingRulesDto,
  LOGO_VARIANTS,
  type LogoVariant,
  PlatformInfoDto,
  SettingsDto,
} from './dto/settings.dto';
import {
  AddClosedDateDto,
  UpdateHoursDto,
  UpdateLogoDto,
  UpdateSalonDto,
  UpdateShippingDto,
} from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

const logoVariantPipe = new ParseEnumPipe(
  Object.fromEntries(LOGO_VARIANTS.map((v) => [v, v])),
);

const LogoVariantParam = () =>
  ApiParam({
    name: 'variante',
    enum: LOGO_VARIANTS,
    description:
      '`principal` (sur fond clair), `clair` (sur fond sombre) ou `icone` (carré)',
  });

// Un point d'API par onglet de l'écran Réglages ; chaque réponse contient tous les réglages
@ApiTags('Admin : réglages')
@AdminOnly()
@ApiOkResponse({ type: SettingsDto, description: 'Réglages à jour' })
@ApiBadRequestResponse({
  type: ErrorResponseDto,
  description: 'Champs invalides',
})
@Controller('admin/parametres')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Put('plateforme')
  @ApiOperation({
    summary: 'Plateforme : identité, contacts et réseaux sociaux',
    description:
      'Remplace nom, slogan, e-mail, téléphones et liens des réseaux sociaux (les logos ne changent pas). ' +
      'Les numéros sont acceptés avec ou sans « +225 » et enregistrés au format « +225 07 00 00 00 00 » ; ' +
      'un second téléphone, un WhatsApp ou un lien vide (ou absent) est enregistré en chaîne vide.',
  })
  setPlatform(@Body() dto: PlatformInfoDto): Promise<SettingsDto> {
    return this.settings.setPlatform(dto);
  }

  @Put('logos/:variante')
  @LogoVariantParam()
  @ApiOperation({
    summary: 'Plateforme : importer un logo',
    description:
      'Remplace une variante du logo par une image en data URL (SVG, PNG, WebP ou JPEG, 500 Ko maximum).',
  })
  setLogo(
    @Param('variante', logoVariantPipe) variant: LogoVariant,
    @Body() dto: UpdateLogoDto,
  ): Promise<SettingsDto> {
    return this.settings.setLogo(variant, dto);
  }

  @Delete('logos/:variante')
  @LogoVariantParam()
  @ApiOperation({
    summary: 'Plateforme : retirer un logo',
    description:
      'Sans logo, le site affiche le nom de la plateforme en texte. Ne fait rien si la variante est déjà vide.',
  })
  removeLogo(
    @Param('variante', logoVariantPipe) variant: LogoVariant,
  ): Promise<SettingsDto> {
    return this.settings.removeLogo(variant);
  }

  @Put('horaires')
  @ApiOperation({
    summary: 'Horaires et créneaux',
    description:
      'Remplace les horaires des 7 jours (index 0 = dimanche), la durée des créneaux et le nombre de places. ' +
      "Un jour ouvert doit fermer après l'ouverture ; une pause a un début et une fin, pendant les heures d'ouverture.",
  })
  setHours(@Body() dto: UpdateHoursDto): Promise<SettingsDto> {
    return this.settings.setHours(dto);
  }

  @Put('regles')
  @ApiOperation({
    summary: 'Règles de réservation',
    description:
      "Fenêtre de réservation, délai minimum avant un créneau et délai d'annulation en ligne.",
  })
  setRules(@Body() dto: BookingRulesDto): Promise<SettingsDto> {
    return this.settings.setRules(dto);
  }

  @Post('fermetures')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fermetures : ajouter un jour fermé',
    description:
      "Aucun créneau n'est proposé ce jour-là. Remplace le motif si le jour est déjà fermé. " +
      'Refuse une date passée.',
  })
  addClosedDate(@Body() dto: AddClosedDateDto): Promise<SettingsDto> {
    return this.settings.addClosedDate(dto);
  }

  @Delete('fermetures/:date')
  @ApiParam({ name: 'date', example: '2026-12-25' })
  @ApiOperation({ summary: 'Fermetures : rouvrir un jour' })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Aucune fermeture ce jour-là',
  })
  removeClosedDate(@Param('date') date: string): Promise<SettingsDto> {
    return this.settings.removeClosedDate(date);
  }

  @Put('salon')
  @ApiOperation({
    summary: 'Salon : adresse et position',
    description:
      "L'adresse s'affiche dans le pied de page, la position sert au lien « Itinéraire ».",
  })
  setSalon(@Body() dto: UpdateSalonDto): Promise<SettingsDto> {
    return this.settings.setSalon(dto);
  }

  @Put('livraisons')
  @ApiOperation({
    summary: 'Livraisons et expéditions',
    description:
      'Remplace les communes livrées à domicile et les villes desservies par expédition, avec leurs frais ' +
      '(francs CFA). Une destination ne peut apparaître qu’une fois par liste (casse ignorée).',
  })
  setShipping(@Body() dto: UpdateShippingDto): Promise<SettingsDto> {
    return this.settings.setShipping(dto);
  }

  @Post('reinitialiser')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rétablir les valeurs par défaut',
    description:
      'Remet tous les onglets à leurs valeurs de départ, retire les logos et supprime les fermetures exceptionnelles.',
  })
  reset(): Promise<SettingsDto> {
    return this.settings.reset();
  }
}
