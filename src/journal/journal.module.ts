import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../auth/entities/account.entity';
import { Admin } from '../auth/entities/admin.entity';
import { AdminJournalController } from './admin-journal.controller';
import { EvenementJournal } from './entities/evenement-journal.entity';
import { JournalInterceptor } from './journal.interceptor';
import { JournalService } from './journal.service';

@Module({
  // Comptes et admins lus pour copier le nom de l'auteur dans l'entrée
  imports: [TypeOrmModule.forFeature([EvenementJournal, Account, Admin])],
  controllers: [AdminJournalController],
  providers: [
    JournalService,
    // Global : les autres modules marquent leurs routes avec `@Journaliser`, sans importer ce module
    { provide: APP_INTERCEPTOR, useClass: JournalInterceptor },
  ],
})
export class JournalModule {}
