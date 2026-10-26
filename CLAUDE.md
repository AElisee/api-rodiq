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
- All routes are under the global prefix `/api` (set in `main.ts`), with no version segment (no `/v1`). Swagger is at `/api/docs` (JSON at `/api/docs-json`).
- `src/app.module.ts` — root module. `ConfigModule` is global (reads `.env`); TypeORM is configured async from `ConfigService` with `getOrThrow` on `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
  - `autoLoadEntities: true`: entities are **not** listed globally — register them in each feature module with `TypeOrmModule.forFeature([...])`.
  - `synchronize` is on whenever `NODE_ENV !== 'production'`, so entity changes alter the dev schema automatically; there are no migrations yet.
- The `@nestjs/swagger` CLI plugin is enabled in `nest-cli.json` with `introspectComments: true`: DTO/entity properties and JSDoc comments are picked up automatically, so explicit `@ApiProperty` is usually unnecessary.
- `.env` also defines `FRONT_URL` (CORS) and `ADMIN_EMAIL` / `ADMIN_PASSWORD` (admin seed). `JWT_SECRET` is currently unused (sessions are stored server-side, not JWT).

## Conventions

- TS config: `module`/`moduleResolution` = `nodenext`, `strict` on but `strictPropertyInitialization` off (TypeORM entity/DTO style).
- oxlint enforces `typescript/no-floating-promises` as an error — `await` or `void` every promise; `no-explicit-any` is off.
