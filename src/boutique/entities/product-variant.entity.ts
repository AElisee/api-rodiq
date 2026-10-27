import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Product } from './product.entity';

// Déclinaison d'un produit (teinte, contenance…), au prix du produit, avec son propre stock
@Entity('declinaisons_produits')
@Index(['produitId', 'position'])
export class ProductVariant {
  // 8 caractères aléatoires, conservés tant que la déclinaison existe (les commandes y renvoient)
  @PrimaryColumn({ length: 16 })
  id: string;

  @Column({ length: 100 })
  produitId: string;

  @ManyToOne(() => Product, (product) => product.declinaisons, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'produitId' })
  produit: Product;

  @Column({ length: 60 })
  nom: string;

  @Column({ type: 'int', unsigned: true })
  stock: number;

  @Column({ type: 'smallint', unsigned: true })
  position: number;
}
