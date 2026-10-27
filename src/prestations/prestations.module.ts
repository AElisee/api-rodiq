import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminPrestationsController } from './admin-prestations.controller';
import { PrestationCategory } from './entities/prestation-category.entity';
import { Prestation } from './entities/prestation.entity';
import { PrestationsController } from './prestations.controller';
import { PrestationsService } from './prestations.service';

@Module({
  imports: [TypeOrmModule.forFeature([PrestationCategory, Prestation])],
  controllers: [PrestationsController, AdminPrestationsController],
  providers: [PrestationsService],
  // Les réservations liront la carte pour figer nom et prix
  exports: [PrestationsService],
})
export class PrestationsModule {}
