import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../auth/entities/account.entity';
import { ProductVariant } from '../boutique/entities/product-variant.entity';
import { Product } from '../boutique/entities/product.entity';
import { Settings } from '../settings/entities/settings.entity';
import { AdminCommandesController } from './admin-commandes.controller';
import { CommandesController } from './commandes.controller';
import { CommandesService } from './commandes.service';
import { Commande } from './entities/commande.entity';

@Module({
  imports: [
    // Compte (coordonnées copiées), produits et déclinaisons (prix, stock verrouillé) et réglages
    // (frais de livraison) lus directement dans la transaction de commande
    TypeOrmModule.forFeature([
      Commande,
      Account,
      Product,
      ProductVariant,
      Settings,
    ]),
  ],
  controllers: [CommandesController, AdminCommandesController],
  providers: [CommandesService],
})
export class CommandesModule {}
