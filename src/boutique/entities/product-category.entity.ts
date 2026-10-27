import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Product } from './product.entity';

// Catégorie de la boutique (« Vernis », « Accessoires »…)
@Entity('categories_produits')
export class ProductCategory {
  // Slug tiré du nom à la création, conservé ensuite : filtre ?categorie= du site
  @PrimaryColumn({ length: 80 })
  id: string;

  @Column({ length: 60 })
  nom: string;

  // Texte des fiches produit sans description propre (chaîne vide = aucun)
  @Column({ length: 500 })
  description: string;

  // Ordre d'affichage (croissant)
  @Column({ type: 'smallint', unsigned: true })
  position: number;

  @OneToMany(() => Product, (product) => product.categorie)
  produits: Product[];
}
