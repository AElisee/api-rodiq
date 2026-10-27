import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/sessions/auth.decorators';
import { PrestationCategoryDto } from './dto/prestations.dto';
import { PrestationsService } from './prestations.service';

@ApiTags('Prestations')
@Controller('prestations')
export class PrestationsController {
  constructor(private readonly prestations: PrestationsService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Carte des prestations',
    description:
      'Catégories dans l’ordre d’affichage, chacune avec ses prestations dans l’ordre. Les catégories ' +
      'vides sont incluses (l’admin les gère) : le site ne les affiche pas. Liste vide tant que rien ' +
      'n’est créé.',
  })
  @ApiOkResponse({ type: [PrestationCategoryDto] })
  list(): Promise<PrestationCategoryDto[]> {
    return this.prestations.list();
  }
}
