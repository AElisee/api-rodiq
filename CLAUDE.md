# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

API RODIQ: a NestJS 12 backend (TypeScript, Express) backed by MySQL through TypeORM. It is at an early stage — essentially the Nest starter plus database, config and Swagger wiring. Code comments and user-facing strings (e.g. Swagger descriptions) are written in French.

## Commands

Package manager is **pnpm**.

```bash
pnpm install
pnpm run start:dev        # watch mode (default port 3001, override with PORT)
pnpm run build            # nest build -> dist/
pnpm run start:prod       # node dist/main
pnpm run lint             # oxlint --type-aware src/ test/ (not ESLint)
pnpm run format           # prettier (single quotes, trailing commas)

pnpm run test             # unit tests: src/**/*.spec.ts
pnpm run test:e2e         # e2e tests: test/**/*.e2e-spec.ts (config: test/jest-e2e.json)
pnpm run test:cov

# Single test file / single test by name
pnpm run test -- src/app.controller.spec.ts
pnpm run test -- -t "should return"
```

Jest runs via `node --experimental-vm-modules` with ts-jest; `jest.config.ts` reads path aliases from `tsconfig.json` `paths`, so add aliases there only. The e2e suite imports the real `AppModule`, so it needs a reachable MySQL database configured in `.env`.

## Architecture

- `src/main.ts` — bootstrap. Applies helmet, cookie-parser, CORS (`FRONT_URL`, credentials) and a global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform), mounts Swagger UI at `/api/docs` (cookie auth declared) and listens on `PORT ?? 3001`.
- `src/auth/` — authentication. Server-side sessions (table `sessions`, only the SHA-256 of the token is stored). The token is set in an `httpOnly` cookie (`rodiq_session` for clients, `rodiq_admin_session` for the admin; independent) **and** returned as `token` in the sign-in/sign-up body; requests may send it either by cookie or `Authorization: Bearer` (header wins). Idle timeouts in `auth.constants.ts` (client 30 days, admin 8 h), renewed on each guarded request. **Secure by default**: a global `SessionGuard` (`APP_GUARD` in `AuthModule`) requires a client session on every route; use `@Public()` to open a route, `@AdminOnly()` (method or controller) for admin, `@ClientOnly()` to make the client requirement explicit and documented in Swagger (`sessions/auth.decorators.ts`). Read the session with `@CurrentSession()`. Passwords hashed with argon2id. The admin account is created at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` if missing (never updated afterwards). Sign-in/sign-up are rate-limited with `ThrottlerGuard`.
- `src/settings/` — salon settings (one per tab of the admin « Réglages » screen). Single-row table `parametres` (id `1`, created once by `POST /admin/parametres` — 409 afterwards; until then `GET /parametres` and every write answer 404; JSON columns for regles/semaine/plateforme/domicile/expedition, one `mediumtext` column per logo data URL) plus table `fermetures`. `GET /parametres` is public; writes are under `/admin/parametres/*` (`plateforme`, `logos/:variante`, `horaires`, `regles`, `fermetures` — 409 if the day has active bookings, `salon`, `livraisons`; logos and closures are not part of the creation body) and each returns the full `SettingsDto` (same structure as the front `settings-store`, French field names). Cross-field checks (hours, duplicate destinations, logo size) live in `settings.rules.ts`. JSON body limit is raised to 1 MB in `main.ts` for logos.
- `src/prestations/` — the price list (« carte des prestations »). Tables `categories_prestations` (id = slug of the name, set at creation and never changed; `ordre` is reserved because of the reorder route) and `prestations` (id = slug + 4 random hex chars; FK `categorieId` with `RESTRICT`); both carry a `position` column for display order (gaps allowed). `GET /prestations` is public and returns every category (empty ones too) with its prestations, in order. Writes under `/admin/prestations/*` (`POST categories`, `PUT categories/ordre`, `PUT|DELETE categories/:id`, `PUT categories/:id/ordre`, `POST /`, `PUT|DELETE :id`) each return the full list. Category names are unique ignoring case/accents (409); deleting a non-empty category is 409; an unknown `categorieId` in a prestation body is 400; reorder bodies `{ ids }` must be a permutation of the existing ids (400). Changing a prestation's category appends it to the new one. Helpers in `prestations.rules.ts`; the service is exported (`findByIds`) for the reservations module.
- `src/reservations/` — bookings, **client account required** (no guest booking: e-mails are unverified, so linking guest bookings by e-mail would leak them). Table `reservations` (uuid id, unique `reference` `RDQ-XXXXXX` from `crypto.randomInt`, FK `compteId` → `accounts` `RESTRICT`, `date`/`debut`/`fin`, `statut` enum `en_attente|confirmee|refusee|annulee|terminee`, `lignes` JSON = prestations with name/price frozen from the catalogue, contact columns copied from the account, `recherche` = normalized search text). Public `GET /creneaux` (slots of the booking window with `placesRestantes`, counts only). Client: `POST /reservations` (body `{ prestationIds, date, debut, canalContact, note? }` — identity from the session, prices from the catalogue; throttled 5/min; max `MAX_ACTIVE_RESERVATIONS` = 3 active upcoming per account; same slot twice → 409), `GET /me/reservations`, `POST /me/reservations/:id/annuler` (filtered by `compteId` → another client's booking is 404; deadline `delaiAnnulationJours`). Admin: `GET /admin/reservations` (filters `statut`, `quand`, `q`, `tri`, `page`, `parPage` ≤ 100 → `{ elements, total, page, parPage, parStatut }`, `parStatut` = counts per status with the other filters), `GET :id`, `POST :id/confirmer|refuser|terminer` (no PUT/DELETE: history is kept). Creation runs in a `READ COMMITTED` transaction that locks the `parametres` row (`SELECT … FOR UPDATE`) so the last place cannot be taken twice; adding a closure takes the same lock and answers 409 if the day still has active bookings. Status changes are conditional updates (`WHERE statut IN (…)`), re-read to explain a 409. Slot/deadline/time logic in `reservations.rules.ts` (computed in UTC = Abidjan time, mirrors the front `lib/reservations.ts`).
- All routes are under the global prefix `/api` (set in `main.ts`), with no version segment (no `/v1`). Swagger is at `/api/docs` (JSON at `/api/docs-json`).
- `src/app.module.ts` — root module. `ConfigModule` is global (reads `.env`); TypeORM is configured async from `ConfigService` with `getOrThrow` on `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
  - `autoLoadEntities: true`: entities are **not** listed globally — register them in each feature module with `TypeOrmModule.forFeature([...])`.
  - `synchronize` is on whenever `NODE_ENV !== 'production'`, so entity changes alter the dev schema automatically; there are no migrations yet.
- The `@nestjs/swagger` CLI plugin is enabled in `nest-cli.json` with `introspectComments: true`: DTO/entity properties and JSDoc comments are picked up automatically, so explicit `@ApiProperty` is usually unnecessary.
- `.env` also defines `FRONT_URL` (CORS) and `ADMIN_EMAIL` / `ADMIN_PASSWORD` (admin seed). `JWT_SECRET` is currently unused (sessions are stored server-side, not JWT).

## Conventions

- **API in French except authentication**: route paths (`/admin/parametres/horaires`, not `/admin/settings/hours`) and JSON attributes of DTOs/entities (`dureeCreneauMinutes`, `adresse`…) are in French. `src/auth/` (`/auth/sign-in`, `/me`…) keeps its English names. Class, file and method names may stay in English.

- **Error messages say what actually happened**, in French, naming the item when known (« La catégorie « Mains » contient encore 2 prestations… », « Prestation introuvable : elle n’existe pas ou a déjà été supprimée »). Give every class-validator decorator an explicit French `message`; list every discrepancy rather than a generic refusal (see `orderErrors` in `prestations.rules.ts`).
- TS config: `module`/`moduleResolution` = `nodenext`, `strict` on but `strictPropertyInitialization` off (TypeORM entity/DTO style).
- oxlint enforces `typescript/no-floating-promises` as an error — `await` or `void` every promise; `no-explicit-any` is off.
