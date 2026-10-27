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
import {
  MODES_PAIEMENT,
  MODES_REMISE,
  type ModePaiement,
  type ModeRemise,
  type OrderLine,
  STATUTS,
  type Statut,
} from '../commandes.rules';

// Commande de la boutique passée par une cliente connectée. Articles, prix, frais et coordonnées
// sont figés à la commande : modifier le catalogue, les tarifs ou le compte ne change pas l'historique
@Entity('commandes')
// Commandes d'une cliente
@Index(['compteId', 'creeLe'])
@Index(['statut', 'creeLe'])
export class Commande {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // CMD-XXXXXX, générée par le serveur
  @Column({ type: 'char', length: 10, unique: true })
  reference: string;

  @Column({ type: 'char', length: 36 })
  compteId: string;

  // RESTRICT : un compte qui a des commandes ne peut pas être supprimé
  @ManyToOne(() => Account, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'compteId' })
  compte: Account;

  @Column({ type: 'enum', enum: STATUTS, default: 'en_attente' })
  statut: Statut;

  // Pas de clé étrangère : supprimer un produit ne touche pas l'historique
  @Column('json')
  lignes: OrderLine[];

  // Montants en francs CFA, figés à la commande
  @Column({ type: 'int', unsigned: true })
  sousTotal: number;

  @Column({ type: 'int', unsigned: true })
  fraisLivraison: number;

  @Column({ type: 'int', unsigned: true })
  total: number;

  @Column({ type: 'enum', enum: MODES_REMISE })
  mode: ModeRemise;

  // Commune ou ville (livraison), null pour un retrait
  @Column({ type: 'varchar', length: 80, nullable: true })
  destination: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  adresse: string | null;

  @Column({ type: 'enum', enum: MODES_PAIEMENT })
  modePaiement: ModePaiement;

  @Column({ default: false })
  payee: boolean;

  @Column({ type: 'datetime', nullable: true })
  payeeLe: Date | null;

  // Coordonnées copiées du compte à la commande
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

  // Chaîne vide = pas de note
  @Column({ length: 500 })
  note: string;

  // Qui a annulé : la cliente (motif facultatif) ou le salon (motif obligatoire)
  @Column({ type: 'enum', enum: ['cliente', 'salon'], nullable: true })
  annuleePar: 'cliente' | 'salon' | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  motifAnnulation: string | null;

  // Nom, téléphones, e-mail et référence normalisés (`normalizeSearch`) pour la recherche admin
  @Column({ length: 500, select: false })
  recherche: string;

  @CreateDateColumn()
  creeLe: Date;

  // Dernier changement de statut
  @Column({ type: 'datetime', nullable: true })
  traiteeLe: Date | null;
}
