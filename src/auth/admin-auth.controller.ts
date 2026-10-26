import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ErrorResponseDto } from '../common/error-response.dto';
import { AdminAuthService } from './admin-auth.service';
import { AdminDto, AdminSessionDto } from './dto/admin.dto';
import { SignInDto } from './dto/sign-in.dto';
import { AdminOnly, Public } from './sessions/auth.decorators';
import { CurrentSession } from './sessions/current-session.decorator';
import type { Session } from './sessions/session.entity';
import { extractSessionToken } from './sessions/session.guard';
import { SessionsService } from './sessions/sessions.service';

// Toutes les routes de ce contrôleur exigent la session admin, sauf celles marquées @Public()
@ApiTags('Admin : authentification')
@AdminOnly()
@Controller('admin')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('auth/sign-in')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Se connecter (admin)',
    description:
      'Pose le cookie de session `rodiq_admin_session` (httpOnly), distinct de celui des clientes, ' +
      'et renvoie le même jeton dans `token` (pour `Authorization: Bearer`). ' +
      "La session se ferme après **8 heures sans activité** : chaque requête admin repousse l'échéance.",
  })
  @ApiOkResponse({ type: AdminSessionDto, description: 'Connecté' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Champs invalides',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'E-mail ou mot de passe incorrect',
  })
  @ApiTooManyRequestsResponse({
    description: 'Trop de tentatives, réessayer dans une minute',
  })
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminSessionDto> {
    const admin = await this.auth.signIn(dto);
    const token = await this.sessions.open('admin', admin.id, res);
    return Object.assign(AdminDto.from(admin), { token });
  }

  @Post('auth/sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @ApiOperation({
    summary: 'Se déconnecter (admin)',
    description:
      'Ferme la session admin côté serveur (jeton du cookie ou de `Authorization: Bearer`) et efface le cookie. ' +
      'Sans session ouverte, ne fait rien (toujours 204).',
  })
  @ApiNoContentResponse({ description: 'Déconnecté' })
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = extractSessionToken(req, 'admin');
    await this.sessions.close('admin', token, res);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Admin connecté',
    description:
      "Renvoie l'admin de la session en cours. Sert à savoir si l'admin est toujours connecté (401 après 8 h d'inactivité).",
  })
  @ApiOkResponse({ type: AdminDto })
  async me(@CurrentSession() session: Session): Promise<AdminDto> {
    return AdminDto.from(await this.auth.findById(session.userId));
  }
}
