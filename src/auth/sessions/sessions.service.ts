import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { LessThan, Repository } from 'typeorm';
import {
  SESSION_COOKIES,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
  type SessionKind,
} from '../auth.constants';
import { Session } from './session.entity';

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly config: ConfigService,
  ) {}

  /** Ouvre une session, pose son cookie et renvoie le jeton (pour `Authorization: Bearer`) */
  async open(kind: SessionKind, userId: string, res: Response) {
    await this.purgeExpired(kind);
    const token = randomBytes(32).toString('base64url');
    await this.sessions.insert({
      kind,
      userId,
      tokenHash: hashToken(token),
      lastActivityAt: new Date(),
    });
    this.setCookie(kind, token, res);
    return token;
  }

  /**
   * Session active liée au jeton, ou null si elle n'existe pas ou a expiré.
   * Chaque appel compte comme une activité : le délai d'inactivité repart de zéro.
   * `res` n'est fourni que si le jeton vient du cookie, pour le prolonger.
   */
  async resume(kind: SessionKind, token: string | undefined, res?: Response) {
    if (!token) return null;
    const session = await this.sessions.findOneBy({
      kind,
      tokenHash: hashToken(token),
    });
    if (!session) return null;

    const now = Date.now();
    if (
      now - session.lastActivityAt.getTime() >
      SESSION_IDLE_TIMEOUT_MS[kind]
    ) {
      await this.sessions.delete(session.id);
      return null;
    }
    if (now - session.lastActivityAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      session.lastActivityAt = new Date(now);
      await this.sessions.update(session.id, {
        lastActivityAt: session.lastActivityAt,
      });
      // Le cookie expire lui aussi après la durée d'inactivité : on le prolonge
      if (res) this.setCookie(kind, token, res);
    }
    return session;
  }

  /**
   * Ferme la session liée au jeton (s'il y en a une) et efface le cookie.
   * Renvoie la session fermée, ou null s'il n'y en avait pas
   */
  async close(kind: SessionKind, token: string | undefined, res: Response) {
    const session = token
      ? await this.sessions.findOneBy({ kind, tokenHash: hashToken(token) })
      : null;
    if (session) await this.sessions.delete(session.id);
    this.clearCookie(kind, res);
    return session;
  }

  clearCookie(kind: SessionKind, res: Response) {
    res.clearCookie(SESSION_COOKIES[kind], this.cookieOptions());
  }

  private setCookie(kind: SessionKind, token: string, res: Response) {
    res.cookie(SESSION_COOKIES[kind], token, {
      ...this.cookieOptions(),
      maxAge: SESSION_IDLE_TIMEOUT_MS[kind],
    });
  }

  private cookieOptions() {
    return {
      // Illisible par le JavaScript du navigateur
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/',
    };
  }

  private purgeExpired(kind: SessionKind) {
    return this.sessions.delete({
      kind,
      lastActivityAt: LessThan(
        new Date(Date.now() - SESSION_IDLE_TIMEOUT_MS[kind]),
      ),
    });
  }
}
