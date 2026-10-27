import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountAuthController } from './account-auth.controller';
import { AccountAuthService } from './account-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { Account } from './entities/account.entity';
import { Admin } from './entities/admin.entity';
import { SessionGuard } from './sessions/session.guard';
import { Session } from './sessions/session.entity';
import { SessionsService } from './sessions/sessions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Admin, Session]),
    // Connexion et inscription : 10 tentatives par minute et par adresse IP
    // (les routes qui posent `@Throttle` ajustent la limite)
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 10 }],
      errorMessage:
        'Trop de tentatives en peu de temps : réessayez dans une minute',
    }),
  ],
  controllers: [AccountAuthController, AdminAuthController],
  providers: [
    AccountAuthService,
    AdminAuthService,
    SessionsService,
    // Garde global : toute route de l'API exige une session cliente par défaut.
    // Ouvrir avec @Public(), réserver à l'admin avec @AdminOnly() (sessions/auth.decorators.ts)
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}
