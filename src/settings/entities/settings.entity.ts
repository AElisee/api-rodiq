import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type {
  BookingRulesDto,
  DayHoursDto,
  PlatformInfoDto,
  ShippingRateDto,
} from '../dto/settings.dto';

// Identifiant de l'unique ligne de la table
export const SETTINGS_ID = 1;

// Réglages du salon : une seule ligne, créée avec les valeurs par défaut à la première lecture
@Entity('parametres')
export class Settings {
  @PrimaryColumn({ type: 'tinyint' })
  id: number;

  @Column('json')
  regles: BookingRulesDto;

  // Index 0 = dimanche … 6 = samedi
  @Column('json')
  semaine: DayHoursDto[];

  @Column({ type: 'smallint' })
  dureeCreneauMinutes: number;

  // null = places illimitées
  @Column({ type: 'tinyint', nullable: true })
  placesParCreneau: number | null;

  @Column('json')
  plateforme: PlatformInfoDto;

  // Logos en data URL, une colonne par variante (en attendant un stockage de fichiers)
  @Column({ type: 'mediumtext', nullable: true })
  logoPrincipal: string | null;

  @Column({ type: 'mediumtext', nullable: true })
  logoClair: string | null;

  @Column({ type: 'mediumtext', nullable: true })
  logoIcone: string | null;

  @Column({ length: 255 })
  adresse: string;

  @Column('double')
  latitude: number;

  @Column('double')
  longitude: number;

  @Column('json')
  domicile: ShippingRateDto[];

  @Column('json')
  expedition: ShippingRateDto[];

  @UpdateDateColumn()
  modifieLe: Date;
}
