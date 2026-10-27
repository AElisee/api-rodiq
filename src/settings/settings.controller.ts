import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/sessions/auth.decorators';
import { SettingsDto } from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Réglages')
@Controller('parametres')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Réglages du salon',
    description:
      'Horaires, créneaux, règles de réservation, fermetures à venir, identité et contacts de la plateforme ' +
      '(logos compris), adresse, position et frais de port. Lu par le site et par l’écran Réglages de l’admin.',
  })
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }
}
