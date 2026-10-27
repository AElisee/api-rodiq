import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { PrestationCategory } from './prestation-category.entity';

// Prestation de la carte. Les réservations en gardent une copie (nom, prix) : la modifier ou la
// supprimer ne change pas les demandes passées
@Entity('prestations')
@Index(['categorieId', 'position'])
export class Prestation {
  // Slug du nom + suffixe aléatoire, fixé à la création
  @PrimaryColumn({ length: 100 })
  id: string;

  @Column({ length: 80 })
  categorieId: string;

  // RESTRICT : une catégorie qui a encore des prestations ne peut pas être supprimée
  @ManyToOne(() => PrestationCategory, (category) => category.prestations, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'categorieId' })
  categorie: PrestationCategory;

  @Column({ length: 80 })
  nom: string;

  // Francs CFA
  @Column({ type: 'int', unsigned: true })
  prix: number;

  // Prix d'appel, affiché « dès … » : le tarif final dépend de la prestation réalisée
  @Column({ default: false })
  prixAPartirDe: boolean;

  // Chaîne vide = pas de précision
  @Column({ length: 120 })
  precision: string;

  // Ordre d'affichage dans la catégorie (croissant)
  @Column({ type: 'smallint', unsigned: true })
  position: number;
}
