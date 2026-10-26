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
  ApiConflictResponse,
  ApiCreatedResponse,
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
import { AccountAuthService } from './account-auth.service';
import { AccountDto, AccountSessionDto } from './dto/account.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';
import { ClientOnly, Public } from './sessions/auth.decorators';
import { CurrentSession } from './sessions/current-session.decorator';
import type { Session } from './sessions/session.entity';
import { extractSessionToken } from './sessions/session.guard';
import { SessionsService } from './sessions/sessions.service';

@ApiTags('Clientes : authentification')
@Controller()
export class AccountAuthController {
  constructor(
    private readonly auth: AccountAuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Post('auth/sign-up')
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Créer un compte',
    description:
      'Crée le compte et connecte aussitôt la cliente : la réponse pose le cookie de session `rodiq_session` ' +
      'et renvoie le même jeton dans `token` (pour `Authorization: Bearer`).',
  })
  @ApiCreatedResponse({
    type: AccountSessionDto,
    description: 'Compte créé, cliente connectée',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Champs invalides',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'E-mail déjà utilisé',
  })
  @ApiTooManyRequestsResponse({
    description: 'Trop de tentatives, réessayer dans une minute',
  })
  async signUp(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountSessionDto> {
    const account = await this.auth.signUp(dto);
    const token = await this.sessions.open('client', account.id, res);
    return Object.assign(AccountDto.from(account), { token });
  }

  @Post('auth/sign-in')
  @HttpCode(HttpStatus.OK)
  @Public()
  @UseGuards(ThrottlerGuard)
  @ApiOperation({
    summary: 'Se connecter',
    description:
      'Vérifie e-mail et mot de passe puis pose le cookie de session `rodiq_session` (httpOnly) ' +
      'et renvoie le même jeton dans `token` (pour `Authorization: Bearer`). ' +
      'La session se ferme après 30 jours sans activité.',
  })
  @ApiOkResponse({ type: AccountSessionDto, description: 'Connectée' })
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
  ): Promise<AccountSessionDto> {
    const account = await this.auth.signIn(dto);
    const token = await this.sessions.open('client', account.id, res);
    return Object.assign(AccountDto.from(account), { token });
  }

  @Post('auth/sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Public()
  @ApiOperation({
    summary: 'Se déconnecter',
    description:
      'Ferme la session côté serveur (jeton du cookie ou de `Authorization: Bearer`) et efface le cookie. ' +
      'Sans session ouverte, ne fait rien (toujours 204).',
  })
  @ApiNoContentResponse({ description: 'Déconnectée' })
  async signOut(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token } = extractSessionToken(req, 'client');
    await this.sessions.close('client', token, res);
  }

  @Get('me')
  @ClientOnly()
  @ApiOperation({
    summary: 'Compte connecté',
    description:
      'Renvoie le compte de la session en cours. Sert aussi à savoir si la cliente est connectée (401 sinon).',
  })
  @ApiOkResponse({ type: AccountDto })
  async me(@CurrentSession() session: Session): Promise<AccountDto> {
    return AccountDto.from(await this.auth.findById(session.userId));
  }
}
