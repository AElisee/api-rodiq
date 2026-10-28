import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SESSION_COOKIES } from './auth/auth.constants';
import {
  PRODUCT_CREATION_BODY_LIMIT,
  PRODUCT_CREATION_PATH,
} from './boutique/boutique.rules';

const DOCS_DESCRIPTION = `
Documentation de l'API RODIQ.

## Authentification

**Toutes les routes exigent une session**, sauf la connexion, l'inscription, la déconnexion et la lecture des réglages (\`GET /api/parametres\`), de la carte des prestations (\`GET /api/prestations\`), des créneaux (\`GET /api/creneaux\`) et de la boutique (\`GET /api/boutique/*\`), ainsi que le comptage des visites (\`POST /api/visites\`). Réserver exige un compte client.

Deux sessions **indépendantes**. À la connexion, l'API pose un cookie \`httpOnly\` et renvoie le même jeton
dans le champ \`token\` de la réponse :

| Qui | Cookie | Connexion | Fermeture automatique |
| --- | --- | --- | --- |
| Cliente | \`${SESSION_COOKIES.client}\` | \`POST /api/auth/sign-in\` ou \`POST /api/auth/sign-up\` | après 30 jours sans activité |
| Admin | \`${SESSION_COOKIES.admin}\` | \`POST /api/admin/auth/sign-in\` | après **8 heures** sans activité |

Chaque requête authentifiée repousse l'échéance. Une route protégée répond \`401\` si la session est absente ou expirée.

Le jeton peut être envoyé de deux façons (l'en-tête l'emporte s'il est présent) :

- **Cookie** (front web) : \`fetch(url, { credentials: 'include' })\`, le navigateur l'envoie seul.
- **En-tête** (Postman, appli mobile, scripts) : \`Authorization: Bearer <token>\`.

**Tester ici** : appeler une route de connexion avec « Try it out » ; le navigateur garde le cookie,
rien à faire de plus. Ou copier \`token\` dans « Authorize » (schéma \`client-bearer\` / \`admin-bearer\`).
`;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Derrière Nginx/Passenger : nombre de proxys devant l'API, pour lire l'IP réelle dans
  // X-Forwarded-For (limites par IP, visiteurs uniques). Jamais sans proxy : l'en-tête serait falsifiable
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (trustProxy > 0) app.set('trust proxy', trustProxy);
  // Ajout d'un produit avec ses photos : seule route qui accepte un gros corps (4 Mo). Réservé aux
  // requêtes qui portent un jeton admin (cookie ou en-tête) : un visiteur anonyme ne fait jamais
  // lire 4 Mo au serveur. Le jeton est vérifié ensuite par le garde ; posé avant le parseur
  // général, qui ne relit pas un corps déjà lu
  const largeJson = json({ limit: PRODUCT_CREATION_BODY_LIMIT });
  app.use((req: Request, res: Response, next: NextFunction) => {
    const withAdminToken =
      !!req.headers.authorization ||
      req.headers.cookie?.includes(`${SESSION_COOKIES.admin}=`);
    if (
      req.method === 'POST' &&
      req.path === PRODUCT_CREATION_PATH &&
      withAdminToken
    ) {
      largeJson(req, res, next);
    } else next();
  });
  // Logos des réglages en data URL (500 Ko, soit ~700 Ko en base64) : au-delà des 100 Ko par défaut
  app.useBodyParser('json', { limit: '1mb' });
  // Toutes les routes sous /api (sans version), documentation comprise : /api/docs
  app.setGlobalPrefix('api');

  app.use(helmet());
  app.use(cookieParser());
  // Le front envoie le cookie de session : origine précise + credentials
  app.enableCors({ origin: process.env.FRONT_URL, credentials: true });
  // Rejette les champs inconnus et applique les @Transform des DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API RODIQ')
    .setDescription(DOCS_DESCRIPTION)
    .setVersion('0.0.1')
    .addCookieAuth(
      SESSION_COOKIES.client,
      { type: 'apiKey', in: 'cookie', description: 'Session cliente' },
      'client',
    )
    .addCookieAuth(
      SESSION_COOKIES.admin,
      { type: 'apiKey', in: 'cookie', description: 'Session admin' },
      'admin',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'Jeton cliente' },
      'client-bearer',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', description: 'Jeton admin' },
      'admin-bearer',
    )
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    () => SwaggerModule.createDocument(app, swaggerConfig),
    { swaggerOptions: { withCredentials: true, tagsSorter: 'alpha' } },
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  Logger.log(`Server running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger docs on http://localhost:${port}/api/docs`, 'Bootstrap');
}
void bootstrap();
