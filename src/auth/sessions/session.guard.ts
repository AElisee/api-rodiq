import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { SESSION_COOKIES, type SessionKind } from '../auth.constants';
import { ROUTE_ACCESS_KEY, type RouteAccess } from './auth.decorators';
import type { Session } from './session.entity';
import { SessionsService } from './sessions.service';

export type AuthenticatedRequest = Request & { session: Session };

/**
 * Jeton de session de la requête : en-tête `Authorization: Bearer …` (Postman, appli mobile)
 * sinon cookie du type demandé (front web).
 */
export const extractSessionToken = (req: Request, kind: SessionKind) => {
  const [scheme, bearer] = req.headers.authorization?.split(' ') ?? [];
  if (scheme?.toLowerCase() === 'bearer' && bearer) {
    return { token: bearer, fromCookie: false };
  }
  const cookie = req.cookies?.[SESSION_COOKIES[kind]] as string | undefined;
  return { token: cookie, fromCookie: !!cookie };
};

/**
 * Garde global : toute route exige une session cliente, sauf `@Public()` ou `@AdminOnly()`.
 * Une nouvelle route est donc protégée tant qu'on ne l'ouvre pas explicitement.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const access =
      this.reflector.getAllAndOverride<RouteAccess | undefined>(
        ROUTE_ACCESS_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? 'client';
    if (access === 'public') return true;

    const http = context.switchToHttp();
    const req = http.getRequest<AuthenticatedRequest>();
    const res = http.getResponse<Response>();
    const { token, fromCookie } = extractSessionToken(req, access);

    // Le cookie n'est prolongé ou effacé que si le jeton est venu par cookie
    const session = await this.sessions.resume(
      access,
      token,
      fromCookie ? res : undefined,
    );
    if (!session) {
      if (fromCookie) this.sessions.clearCookie(access, res);
      throw new UnauthorizedException(
        'Session absente ou expirée : reconnectez-vous',
      );
    }
    req.session = session;
    return true;
  }
}
