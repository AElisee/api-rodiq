import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProductCategory } from './product-category.entity';
import { ProductPhoto } from './product-photo.entity';
import { ProductVariant } from './product-variant.entity';

export type Mesure = { valeur: number; unite: string };

// Produit de la boutique. Les commandes en garderont une copie (nom, prix) : le modifier ou le
// supprimer ne changera pas les commandes passées
@Entity('produits')
@Index(['masque', 'categorieId'])
export class Product {
  // Slug du nom + suffixe aléatoire, fixé à la création
  @PrimaryColumn({ length: 100 })
  id: string;

  @Column({ length: 80 })
  categorieId: string;

  // RESTRICT : une catégorie qui a encore des produits (masqués compris) ne peut pas être supprimée
  @ManyToOne(() => ProductCategory, (category) => category.produits, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categorieId' })
  categorie: ProductCategory;

  @Column({ length: 80 })
  nom: string;

  // Prix payé, en francs CFA
  @Column({ type: 'int', unsigned: true })
  prix: number;

  // Prix d'origine affiché barré (promotion), null sinon
  @Column({ type: 'int', unsigned: true, nullable: true })
  prixBarre: number | null;

  // Chaîne vide = la fiche affiche la description de la catégorie
  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'json', nullable: true })
  contenance: Mesure | null;

  @Column({ type: 'json', nullable: true })
  poids: Mesure | null;

  // Stock d'un produit sans déclinaison (0 si le produit a des déclinaisons)
  @Column({ type: 'int', unsigned: true, default: 0 })
  stock: number;

  // Alerte « stock faible » dans l'admin à partir de cette quantité restante
  @Column({ type: 'smallint', unsigned: true })
  seuilStockFaible: number;

  // Masqué : absent du site, ne peut pas être commandé
  @Column({ default: false })
  masque: boolean;

  // Nom normalisé (sans accents, minuscules, sans espaces) pour la recherche
  @Column({ length: 80 })
  recherche: string;

  // Incrémentée à chaque écriture du produit ou de son stock : une modification envoyée avec une
  // version dépassée est refusée (409) au lieu d'écraser le stock vendu entre-temps
  @Column({ type: 'int', unsigned: true, default: 1 })
  version: number;

  @CreateDateColumn()
  creeLe: Date;

  @UpdateDateColumn()
  modifieLe: Date;

  @OneToMany(() => ProductVariant, (variant) => variant.produit)
  declinaisons: ProductVariant[];

  @OneToMany(() => ProductPhoto, (photo) => photo.produit)
  photos: ProductPhoto[];
}
