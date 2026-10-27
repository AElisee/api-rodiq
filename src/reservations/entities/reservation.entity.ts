import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Account } from '../../auth/entities/account.entity';
import type { LigneReservationDto } from '../dto/reservations.dto';
import {
  CANAUX_CONTACT,
  type CanalContact,
  STATUTS,
  type Statut,
} from '../reservations.rules';

// Réservation d'une cliente connectée. Prestations, prix et coordonnées sont figés à la demande :
// modifier la carte ou le compte ne change pas les réservations passées
@Entity('reservations')
// Places prises sur un créneau
@Index(['date', 'debut', 'statut'])
// Réservations d'une cliente
@Index(['compteId', 'date'])
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // RDQ-XXXXXX, générée par le serveur
  @Column({ type: 'char', length: 10, unique: true })
  reference: string;

  @Column({ type: 'char', length: 36 })
  compteId: string;

  // RESTRICT : un compte qui a des réservations ne peut pas être supprimé
  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'compteId' })
  compte: Account;

  // yyyy-MM-dd
  @Column({ type: 'date' })
  date: string;

  // HH:mm
  @Column({ type: 'char', length: 5 })
  debut: string;

  @Column({ type: 'char', length: 5 })
  fin: string;

  @Column({ type: 'enum', enum: STATUTS, default: 'en_attente' })
  statut: Statut;

  // Pas de clé étrangère : supprimer une prestation de la carte ne touche pas l'historique
  @Column('json')
  lignes: LigneReservationDto[];

  // Coordonnées copiées du compte à la réservation
  @Column({ length: 80 })
  prenom: string;

  @Column({ length: 80 })
  nom: string;

  @Column({ length: 20 })
  telephone: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp: string | null;

  @Column({ length: 254 })
  email: string;

  @Column({ type: 'enum', enum: CANAUX_CONTACT })
  canalContact: CanalContact;

  // Chaîne vide = pas de note
  @Column({ length: 500 })
  note: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motifRefus: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motifAnnulation: string | null;

  // Nom, téléphones, e-mail et référence normalisés (`normalizeSearch`) pour la recherche admin
  @Column({ length: 500, select: false })
  recherche: string;

  @CreateDateColumn()
  creeLe: Date;

  // Dernier changement de statut (confirmation, refus, annulation, fin)
  @Column({ type: 'datetime', nullable: true })
  traiteeLe: Date | null;
}
