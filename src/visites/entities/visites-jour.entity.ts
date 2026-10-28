import { Column, Entity, PrimaryColumn } from 'typeorm';

// Nombre de visiteurs uniques d'une journée : seul chiffre conservé une fois la journée finie
@Entity('visites_par_jour')
export class VisitesJour {
  // yyyy-MM-dd, à l'heure d'Abidjan
  @PrimaryColumn({ type: 'date' })
  jour: string;

  @Column({ type: 'int', unsigned: true })
  visiteurs: number;
}
