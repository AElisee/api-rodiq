import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  ACTEURS,
  CATEGORIES,
  RESULTATS,
  type Categorie,
  type Resultat,
  type TypeActeur,
} from '../journal.rules';

// Une entrée du journal d'activité. Jamais modifiée : écrite par l'API après l'action, supprimée
// seulement au-delà de la durée de conservation (`CONSERVATION_JOURS`). Les noms de l'acteur et de la
// cible sont copiés au moment de l'action : l'entrée reste lisible si l'élément change ou disparaît
@Entity('journal')
@Index(['categorie', 'le'])
export class EvenementJournal {
  // Croissant : départage deux entrées de la même milliseconde
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Index()
  @CreateDateColumn({ type: 'datetime', precision: 3 })
  le: Date;

  // Déduite de l'action, gardée en colonne pour filtrer avec l'index
  @Column({ type: 'enum', enum: CATEGORIES })
  categorie: Categorie;

  // Code du catalogue `ACTIONS` (journal.rules.ts)
  @Column({ length: 50 })
  action: string;

  @Column({ type: 'enum', enum: RESULTATS })
  resultat: Resultat;

  @Column({ type: 'enum', enum: ACTEURS })
  acteurType: TypeActeur;

  // Compte client ou admin ; null pour une personne non connectée
  @Index()
  @Column({ type: 'char', length: 36, nullable: true })
  acteurId: string | null;

  // « Prénom Nom » d'un client, e-mail de l'admin, e-mail saisi pour une connexion refusée
  @Column({ type: 'varchar', length: 254, nullable: true })
  acteurNom: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cibleType: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  cibleId: string | null;

  // Référence (RDQ-…, CMD-…), nom du produit ou de la prestation, onglet des réglages…
  @Column({ type: 'varchar', length: 200, nullable: true })
  cibleLibelle: string | null;

  // Précision : motif d'annulation, raison d'un refus de connexion…
  @Column({ type: 'varchar', length: 500, nullable: true })
  detail: string | null;

  // IPv6 au plus : 45 caractères
  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  // User-Agent, tronqué
  @Column({ type: 'varchar', length: 255, nullable: true })
  navigateur: string | null;

  // Acteur, cible, libellé de l'action, précision et IP normalisés (`normalizeSearch`)
  @Column({ length: 1000, default: '', select: false })
  recherche: string;
}
