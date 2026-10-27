import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminBoutiqueController } from './admin-boutique.controller';
import { BoutiqueController } from './boutique.controller';
import { ProductCategory } from './entities/product-category.entity';
import { ProductPhoto } from './entities/product-photo.entity';
import { ProductVariant } from './entities/product-variant.entity';
import { Product } from './entities/product.entity';
import { ProductCategoriesService } from './product-categories.service';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductCategory,
      Product,
      ProductVariant,
      ProductPhoto,
    ]),
  ],
  controllers: [BoutiqueController, AdminBoutiqueController],
  providers: [ProductCategoriesService, ProductsService],
  // Les commandes liront le catalogue pour figer nom et prix et décrémenter le stock
  exports: [ProductsService],
})
export class BoutiqueModule {}
