import { Entity, PrimaryColumn } from 'typeorm';

// Visiteur déjà compté aujourd'hui. L'empreinte est un hachage salé (sel du jour + IP + User-Agent) :
// ni l'IP ni le navigateur ne sont stockés. Les lignes des jours passés sont supprimées
@Entity('empreintes_visiteurs')
export class EmpreinteVisiteur {
  // yyyy-MM-dd
  @PrimaryColumn({ type: 'date' })
  jour: string;

  // SHA-256 en hexadécimal
  @PrimaryColumn({ type: 'char', length: 64 })
  empreinte: string;
}
