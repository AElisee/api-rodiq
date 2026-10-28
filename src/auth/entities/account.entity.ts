import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { normalizeSearch } from '../../reservations/reservations.rules';

// Compte client (inscription sur le site)
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  firstName: string;

  @Column({ length: 80 })
  lastName: string;

  // +225 07 00 00 00 00
  @Column({ length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp: string | null;

  // Toujours en minuscules
  @Column({ length: 254, unique: true })
  email: string;

  // Empreinte argon2id, jamais renvoyée par défaut dans les requêtes
  @Column({ select: false })
  passwordHash: string;

  // Nom, téléphones et e-mail normalisés (`normalizeSearch`) pour la recherche de l'écran Clientèle
  @Column({ length: 500, default: '', select: false })
  recherche: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const accountSearchText = (
  account: Pick<
    Account,
    'firstName' | 'lastName' | 'phone' | 'whatsapp' | 'email'
  >,
) =>
  normalizeSearch(
    [
      account.firstName,
      account.lastName,
      account.phone,
      account.whatsapp ?? '',
      account.email,
    ].join(''),
  );
