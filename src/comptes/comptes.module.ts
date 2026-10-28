import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../auth/entities/account.entity';
import { Commande } from '../commandes/entities/commande.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { AdminComptesController } from './admin-comptes.controller';
import { ComptesService } from './comptes.service';

@Module({
  // Réservations et commandes lues directement pour l'activité et l'historique de chaque compte
  imports: [TypeOrmModule.forFeature([Account, Reservation, Commande])],
  controllers: [AdminComptesController],
  providers: [ComptesService],
})
export class ComptesModule {}
