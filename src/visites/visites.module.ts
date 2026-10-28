import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminVisitesController } from './admin-visites.controller';
import { EmpreinteVisiteur } from './entities/empreinte-visiteur.entity';
import { SelVisites } from './entities/sel-visites.entity';
import { VisitesJour } from './entities/visites-jour.entity';
import { VisitesController } from './visites.controller';
import { VisitesService } from './visites.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([VisitesJour, EmpreinteVisiteur, SelVisites]),
  ],
  controllers: [VisitesController, AdminVisitesController],
  providers: [VisitesService],
})
export class VisitesModule {}
