import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

// Photo d'un produit, stockée en binaire après vérification de sa signature. Jamais modifiée :
// une nouvelle photo a un nouvel identifiant, ce qui permet un cache navigateur permanent
@Entity('photos_produits')
@Index(['produitId', 'position'])
export class ProductPhoto {
  // UUID v4 aléatoire : l'adresse de la photo ne se devine pas
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  produitId: string;

  @ManyToOne(() => Product, (product) => product.photos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'produitId' })
  produit: Product;

  // image/jpeg, image/png ou image/webp, vérifié sur le contenu
  @Column({ length: 20 })
  type: string;

  // Lu seulement par la route qui sert l'image
  @Column({ type: 'mediumblob', select: false })
  donnees: Buffer;

  @Column({ type: 'int', unsigned: true })
  octets: number;

  // La première photo sert de visuel principal
  @Column({ type: 'smallint', unsigned: true })
  position: number;

  @CreateDateColumn()
  creeLe: Date;
}
