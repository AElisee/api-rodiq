import { Controller, Get } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/sessions/auth.decorators';
import { ErrorResponseDto } from '../common/error-response.dto';
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
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      "Le salon n'est pas encore configuré (voir `POST /admin/parametres`)",
  })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }
}
