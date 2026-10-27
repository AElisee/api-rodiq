import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { Prestation } from './prestation.entity';

// Catégorie de la carte des prestations (« Mains », « Pieds »…)
@Entity('categories_prestations')
export class PrestationCategory {
  // Slug tiré du nom à la création, conservé ensuite : sert d'ancre sur /prestations
  @PrimaryColumn({ length: 80 })
  id: string;

  @Column({ length: 60 })
  nom: string;

  // Chaîne vide = pas d'accroche
  @Column({ length: 120 })
  accroche: string;

  // Ordre d'affichage (croissant)
  @Column({ type: 'smallint', unsigned: true })
  position: number;

  @OneToMany(() => Prestation, (prestation) => prestation.categorie)
  prestations: Prestation[];
}
