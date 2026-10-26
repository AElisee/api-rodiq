import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
