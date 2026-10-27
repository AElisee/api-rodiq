import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../auth/entities/account.entity';
import { PrestationsModule } from '../prestations/prestations.module';
import { ClosedDate } from '../settings/entities/closed-date.entity';
import { Settings } from '../settings/entities/settings.entity';
import { AdminReservationsController } from './admin-reservations.controller';
import { Reservation } from './entities/reservation.entity';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({
  imports: [
    // Comptes (coordonnées copiées), réglages et fermetures (créneaux) lus directement
    TypeOrmModule.forFeature([Reservation, Account, Settings, ClosedDate]),
    PrestationsModule,
  ],
  controllers: [ReservationsController, AdminReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
