import { Column, Entity, PrimaryColumn } from 'typeorm';

// Fermeture exceptionnelle : une par jour au plus
@Entity('fermetures')
export class ClosedDate {
  // yyyy-MM-dd
  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ length: 120 })
  motif: string;
}
