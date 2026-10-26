import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/error-response.dto';
import type { SessionKind } from '../auth.constants';

// Accès exigé par une route : lu par le garde global `SessionGuard`
export type RouteAccess = SessionKind | 'public';

export const ROUTE_ACCESS_KEY = 'rodiq:route-access';

const requireSession = (kind: SessionKind) =>
  applyDecorators(
    SetMetadata(ROUTE_ACCESS_KEY, kind),
    ApiCookieAuth(kind),
    ApiBearerAuth(`${kind}-bearer`),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description: 'Pas connecté(e) ou session expirée',
    }),
  );

/** Route ouverte à tous, sans session (connexion, inscription…) */
export const Public = () => SetMetadata(ROUTE_ACCESS_KEY, 'public');

/**
 * Réservé aux clientes connectées. C'est aussi l'accès par défaut d'une route sans décorateur ;
 * le poser explicitement documente la route dans Swagger.
 */
export const ClientOnly = () => requireSession('client');

/** Réservé à l'admin connecté */
export const AdminOnly = () => requireSession('admin');
