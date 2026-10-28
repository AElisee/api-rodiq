import { Column, Entity, PrimaryColumn } from 'typeorm';

// Sel du jour des empreintes, partagé par les instances de l'API et gardé après un redémarrage.
// Supprimé le lendemain : les empreintes ne peuvent alors plus être reliées à personne
@Entity('sels_visites')
export class SelVisites {
  // yyyy-MM-dd
  @PrimaryColumn({ type: 'date' })
  jour: string;

  // 32 octets aléatoires en hexadécimal
  @Column({ type: 'char', length: 64 })
  sel: string;
}
