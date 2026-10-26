import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { SessionKind } from '../auth.constants';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Empreinte SHA-256 du jeton du cookie : le jeton lui-même n'est jamais stocké
  @Column({ type: 'char', length: 64, unique: true })
  tokenHash: string;

  @Column({ type: 'enum', enum: ['client', 'admin'] })
  kind: SessionKind;

  // Identifiant du compte client ou de l'admin, selon `kind`
  @Index()
  @Column({ type: 'char', length: 36 })
  userId: string;

  @Column({ type: 'datetime' })
  lastActivityAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
