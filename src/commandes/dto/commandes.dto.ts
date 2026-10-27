import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { QUANTITE_MAX_PAR_LIGNE } from '../../boutique/boutique.rules';
import { trim } from '../../common/transforms';
import {
  MAX_LIGNES,
  MODES_PAIEMENT,
  MODES_REMISE,
  type ModePaiement,
  type ModeRemise,
  STATUTS,
  type Statut,
} from '../commandes.rules';

// Commandes : réponses et corps des requêtes
// (même structure que `Order` de `lib/commandes.ts` du front, noms en français)

/** Article figé au moment de la commande (le catalogue peut changer ensuite) */
export class LigneCommandeDto {
  /** @example "vernis-rose-poudre-3f2a1b" */
  produitId: string;

  /** null si le produit n'a pas de déclinaison @example "a1b2c3d4" */
  declinaisonId: string | null;

  /** @example "Vernis gel" */
  nom: string;

  /** Déclinaison choisie, null si aucune @example "Rose poudré" */
  declinaison: string | null;

  /** Prix unitaire en francs CFA au moment de la commande @example 4500 */
  prixUnitaire: number;

  /** @example 2 */
  quantite: number;
}

/** Coordonnées de la cliente, copiées de son compte à la commande */
export class ContactCommandeDto {
  /** @example "Aïcha" */
  prenom: string;

  /** @example "Koné" */
  nom: string;

  /** @example "+225 07 00 00 00 00" */
  telephone: string;

  /** null si non renseigné */
  whatsapp: string | null;

  /** @example "aicha.kone@exemple.ci" */
  email: string;
}

export class CommandeDto {
  /** @example "3f2b8c1e-5d4a-4e7b-9c2f-1a2b3c4d5e6f" */
  id: string;

  /** Référence courte communiquée à la cliente @example "CMD-H9XC3B" */
  reference: string;

  @ApiProperty({ enum: STATUTS, example: 'en_attente' })
  statut: Statut;

  lignes: LigneCommandeDto[];

  /** Somme des lignes en francs CFA @example 9000 */
  sousTotal: number;

  /** 0 pour un retrait au salon @example 2000 */
  fraisLivraison: number;

  /** @example 11000 */
  total: number;

  @ApiProperty({ enum: MODES_REMISE, example: 'livraison' })
  mode: ModeRemise;

  /** Commune ou ville, null pour un retrait @example "Cocody" */
  destination: string | null;

  /** null pour un retrait @example "Angré 7e tranche, près de la pharmacie" */
  adresse: string | null;

  @ApiProperty({ enum: MODES_PAIEMENT, example: 'mobile_money' })
  modePaiement: ModePaiement;

  /** Paiement reçu par le salon */
  payee: boolean;

  contact: ContactCommandeDto;

  /** Note de la cliente (chaîne vide si aucune) */
  note: string;

  /** Qui a annulé, null sauf statut `annulee` */
  @ApiProperty({ enum: ['cliente', 'salon'], nullable: true, example: null })
  annuleePar: 'cliente' | 'salon' | null;

  /** Motif de l'annulation (obligatoire côté salon, facultatif côté cliente) */
  motifAnnulation: string | null;

  /** Date de la commande (ISO 8601) */
  creeLe: Date;

  /** Dernier changement de statut (ISO 8601), null tant qu'elle n'est pas traitée */
  traiteeLe: Date | null;
}

/** Commande vue par la cliente */
export class CommandeClienteDto extends CommandeDto {
  /** La cliente peut encore l'annuler en ligne (préparation pas commencée) */
  annulable: boolean;
}

/** Commande vue par l'admin */
export class CommandeAdminDto extends CommandeDto {
  /** Compte de la cliente */
  compteId: string;

  /** Date d'encaissement (ISO 8601), null si non payée */
  payeeLe: Date | null;
}

export class CommandesPageDto {
  elements: CommandeAdminDto[];

  /** Nombre total de commandes correspondant aux filtres @example 42 */
  total: number;

  /** @example 1 */
  page: number;

  /** @example 20 */
  parPage: number;

  /**
   * Nombre de commandes par statut avec les mêmes filtres, hors filtre de statut
   * @example { "en_attente": 3, "en_preparation": 2, "prete": 1, "livree": 30, "annulee": 4 }
   */
  @ApiProperty({
    type: 'object',
    properties: Object.fromEntries(
      STATUTS.map((s) => [s, { type: 'integer' }]),
    ),
  })
  parStatut: Record<Statut, number>;
}

/** Article demandé : le prix vient du catalogue, jamais du navigateur */
export class LigneDemandeeDto {
  /** @example "vernis-rose-poudre-3f2a1b" */
  @IsString({ message: 'Chaque article doit désigner un produit' })
  @MaxLength(100, { message: 'Identifiant de produit trop long' })
  produitId: string;

  /** Obligatoire si le produit a des déclinaisons, absent sinon @example "a1b2c3d4" */
  @IsOptional()
  @IsString({
    message: 'La déclinaison doit être désignée par son identifiant',
  })
  @MaxLength(16, { message: 'Identifiant de déclinaison trop long' })
  declinaisonId?: string;

  /** @example 2 */
  @IsInt({
    message: `Quantité : un nombre entier de 1 à ${QUANTITE_MAX_PAR_LIGNE}`,
  })
  @Min(1, {
    message: `Quantité : un nombre entier de 1 à ${QUANTITE_MAX_PAR_LIGNE}`,
  })
  @Max(QUANTITE_MAX_PAR_LIGNE, {
    message: `Quantité : ${QUANTITE_MAX_PAR_LIGNE} au plus par article`,
  })
  quantite: number;
}

/** Commande : l'identité vient du compte connecté, les prix du catalogue, les frais des réglages */
export class CreateCommandeDto {
  @IsArray({ message: 'Le panier est vide' })
  @ArrayMinSize(1, { message: 'Le panier est vide' })
  @ArrayMaxSize(MAX_LIGNES, {
    message: `${MAX_LIGNES} articles différents au plus par commande`,
  })
  @ValidateNested({ each: true })
  @Type(() => LigneDemandeeDto)
  lignes: LigneDemandeeDto[];

  @ApiProperty({ enum: MODES_REMISE, example: 'livraison' })
  @IsIn(MODES_REMISE, { message: 'Mode de remise : livraison ou retrait' })
  mode: ModeRemise;

  /** Commune livrée ou ville desservie (réglages), seulement pour une livraison @example "Cocody" */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La destination doit être un texte' })
  @MaxLength(80, { message: 'Destination : 80 caractères au plus' })
  destination?: string;

  /** Adresse ou repère, seulement pour une livraison @example "Angré 7e tranche, près de la pharmacie" */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'L’adresse doit être un texte' })
  @MaxLength(200, { message: 'Adresse : 200 caractères au plus' })
  adresse?: string;

  @ApiProperty({ enum: MODES_PAIEMENT, example: 'mobile_money' })
  @IsIn(MODES_PAIEMENT, {
    message: 'Mode de paiement : mobile_money ou especes',
  })
  modePaiement: ModePaiement;

  /**
   * Total affiché à la cliente (articles + frais). Si le catalogue ou les frais ont changé depuis,
   * la commande est refusée (409) au lieu d'être passée à un autre prix
   * @example 11000
   */
  @IsInt({ message: 'Total attendu : un montant entier en francs CFA' })
  @Min(0, { message: 'Total attendu : un montant entier en francs CFA' })
  totalAttendu: number;

  /** Précision pour le salon @example "Paquet cadeau, disponible après 17 h" */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La note doit être un texte' })
  @MaxLength(500, { message: 'Note : 500 caractères au plus' })
  note?: string;
}

/** Annulation par la cliente */
export class CancelCommandeDto {
  /** Motif transmis au salon, facultatif @example "Je me suis trompée de teinte" */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'Le motif doit être un texte' })
  @MaxLength(500, { message: 'Motif : 500 caractères au plus' })
  motif?: string;
}

/** Annulation par le salon : le motif est affiché à la cliente */
export class AdminCancelCommandeDto {
  /** @example "Produit endommagé à la réception : nous vous recontactons pour un remplacement." */
  @Transform(trim)
  @IsString({ message: 'Indiquez le motif de l’annulation' })
  @MinLength(5, { message: 'Motif de l’annulation : 5 caractères au moins' })
  @MaxLength(500, { message: 'Motif de l’annulation : 500 caractères au plus' })
  motif: string;
}

export const PAIEMENTS = ['payees', 'a-encaisser'] as const;
export const TRIS = ['recentes', 'anciennes', 'total-desc', 'nom'] as const;

/** Filtres de la liste admin (mêmes choix que l'écran Commandes) */
export class CommandesQueryDto {
  @ApiProperty({ enum: STATUTS, required: false })
  @IsOptional()
  @IsIn(STATUTS, { message: `Statut inconnu : ${STATUTS.join(', ')}` })
  statut?: Statut;

  /** Commandes payées ou restant à encaisser (hors annulées) */
  @ApiProperty({ enum: PAIEMENTS, required: false })
  @IsOptional()
  @IsIn(PAIEMENTS, { message: 'Paiement : payees ou a-encaisser' })
  paiement?: (typeof PAIEMENTS)[number];

  @ApiProperty({ enum: MODES_REMISE, required: false })
  @IsOptional()
  @IsIn(MODES_REMISE, { message: 'Mode de remise : livraison ou retrait' })
  mode?: ModeRemise;

  /** Recherche dans le nom, les téléphones, l'e-mail et la référence @example "kone" */
  @Transform(trim)
  @IsOptional()
  @IsString({ message: 'La recherche doit être un texte' })
  @MaxLength(100, { message: 'Recherche : 100 caractères au plus' })
  q?: string;

  @ApiProperty({ enum: TRIS, required: false, default: 'recentes' })
  @IsOptional()
  @IsIn(TRIS, { message: `Tri inconnu : ${TRIS.join(', ')}` })
  tri: (typeof TRIS)[number] = 'recentes';

  /** @example 1 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page : un nombre entier à partir de 1' })
  @Min(1, { message: 'Page : un nombre entier à partir de 1' })
  page: number = 1;

  /** Commandes par page (1 à 100) @example 20 */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Commandes par page : entre 1 et 100' })
  @Min(1, { message: 'Commandes par page : entre 1 et 100' })
  @Max(100, { message: 'Commandes par page : entre 1 et 100' })
  parPage: number = 20;
}
