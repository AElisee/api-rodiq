import { randomInt } from 'node:crypto';
import { QUANTITE_MAX_PAR_LIGNE } from '../boutique/boutique.rules';
import type { ShippingRateDto } from '../settings/dto/settings.dto';

// Règles vérifiées par les écrans Commande du front (`lib/commandes.ts`), revérifiées ici

// Cycle de vie :
// en_attente → en_preparation → prete (expédiée ou prête au retrait) → livree
// en_attente → annulee (par la cliente, tant que le salon n'a pas commencé la préparation)
// en_attente / en_preparation → annulee (motif obligatoire, côté admin)
// Toute annulation rend le stock
export const STATUTS = [
  'en_attente',
  'en_preparation',
  'prete',
  'livree',
  'annulee',
] as const;
export type Statut = (typeof STATUTS)[number];

// Commande en cours : demande une action du salon
export const OPEN_STATUTS: Statut[] = ['en_attente', 'en_preparation', 'prete'];

// Le salon peut annuler tant que le colis n'est pas parti (ou la commande pas mise de côté)
export const SALON_CANCELLABLE: Statut[] = ['en_attente', 'en_preparation'];
// La cliente seulement avant que la préparation commence
export const CLIENT_CANCELLABLE: Statut[] = ['en_attente'];

export const MODES_REMISE = ['livraison', 'retrait'] as const;
export type ModeRemise = (typeof MODES_REMISE)[number];

export const MODES_PAIEMENT = ['mobile_money', 'especes'] as const;
export type ModePaiement = (typeof MODES_PAIEMENT)[number];

// Commandes en attente par compte : une commande retient le stock tant qu'elle n'est pas traitée,
// un compte ne peut donc pas bloquer tout un rayon avec des commandes jamais honorées
export const MAX_PENDING_ORDERS = 3;

export const MAX_LIGNES = 20;

const PRICE_FORMAT = new Intl.NumberFormat('fr-FR');

/** « 12 500 FCFA » */
export const formatPrice = (amount: number) =>
  `${PRICE_FORMAT.format(amount).replace(/\s/g, ' ')} FCFA`;

// Référence courte communiquée à la cliente, sans caractères ambigus (0/O, 1/I)
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const newReference = () =>
  `CMD-${Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('')}`;

/** Ligne demandée par le panier */
export type RequestedLine = {
  produitId: string;
  declinaisonId?: string;
  quantite: number;
};

/** Ligne figée dans la commande */
export type OrderLine = {
  produitId: string;
  declinaisonId: string | null;
  nom: string;
  declinaison: string | null;
  prixUnitaire: number;
  quantite: number;
};

/** Produit du catalogue tel que lu (verrouillé) à la commande */
export type CatalogProduct = {
  id: string;
  nom: string;
  prix: number;
  stock: number;
  masque: boolean;
  declinaisons: { id: string; nom: string; stock: number }[];
};

const lineKey = (line: Pick<RequestedLine, 'produitId' | 'declinaisonId'>) =>
  `${line.produitId}:${line.declinaisonId ?? ''}`;

/** Même article (produit + déclinaison) demandé sur plusieurs lignes */
export const duplicateLineErrors = (lines: RequestedLine[]) => {
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const line of lines) {
    const key = lineKey(line);
    if (seen.has(key)) {
      errors.push(
        `L’article « ${line.produitId}${line.declinaisonId ? ` / ${line.declinaisonId}` : ''} » ` +
          'apparaît sur plusieurs lignes : regroupez les quantités',
      );
    }
    seen.add(key);
  }
  return errors;
};

/**
 * Lignes figées (nom et prix du catalogue) et stock à retirer, ou chaque écart constaté.
 * Le stock n'est révélé que sous `QUANTITE_MAX_PAR_LIGNE`, comme sur le site
 */
export const resolveLines = (
  requested: RequestedLine[],
  products: Map<string, CatalogProduct>,
): { lignes: OrderLine[] } | { errors: string[] } => {
  const errors: string[] = [];
  const lignes: OrderLine[] = [];
  for (const line of requested) {
    const product = products.get(line.produitId);
    if (!product || product.masque) {
      errors.push(
        product
          ? `« ${product.nom} » n’est plus en vente : retirez-le du panier`
          : `Le produit « ${line.produitId} » n’existe plus : retirez-le du panier`,
      );
      continue;
    }
    let variant: CatalogProduct['declinaisons'][number] | null = null;
    if (product.declinaisons.length) {
      if (!line.declinaisonId) {
        errors.push(
          `Choisissez une déclinaison de « ${product.nom} » (${product.declinaisons.map((d) => d.nom).join(', ')})`,
        );
        continue;
      }
      variant =
        product.declinaisons.find((d) => d.id === line.declinaisonId) ?? null;
      if (!variant) {
        errors.push(
          `La déclinaison choisie de « ${product.nom} » n’existe plus : choisissez-en une autre`,
        );
        continue;
      }
    } else if (line.declinaisonId) {
      errors.push(
        `« ${product.nom} » n’a plus de déclinaisons : rechargez la fiche du produit`,
      );
      continue;
    }

    const name = variant ? `${product.nom} · ${variant.nom}` : product.nom;
    const stock = variant ? variant.stock : product.stock;
    if (stock === 0) {
      errors.push(`« ${name} » est épuisé : retirez-le du panier`);
      continue;
    }
    if (line.quantite > stock) {
      errors.push(
        `Il ne reste que ${Math.min(stock, QUANTITE_MAX_PAR_LIGNE)} « ${name} » : ` +
          `${line.quantite} demandé${line.quantite > 1 ? 's' : ''}`,
      );
      continue;
    }
    lignes.push({
      produitId: product.id,
      declinaisonId: variant?.id ?? null,
      nom: product.nom,
      declinaison: variant?.nom ?? null,
      prixUnitaire: product.prix,
      quantite: line.quantite,
    });
  }
  return errors.length ? { errors } : { lignes };
};

export const subtotal = (
  lines: Pick<OrderLine, 'prixUnitaire' | 'quantite'>[],
) => lines.reduce((sum, line) => sum + line.prixUnitaire * line.quantite, 0);

/**
 * Remise demandée : frais tirés des réglages (jamais du navigateur), ou chaque écart.
 * `destination` est une commune livrée à domicile ou une ville desservie par expédition
 */
export const resolveDelivery = (
  rates: { domicile: ShippingRateDto[]; expedition: ShippingRateDto[] },
  request: { mode: ModeRemise; destination?: string; adresse?: string },
):
  | {
      fraisLivraison: number;
      destination: string | null;
      adresse: string | null;
    }
  | { errors: string[] } => {
  if (request.mode === 'retrait') {
    const errors: string[] = [];
    if (request.destination) {
      errors.push('Pas de destination pour un retrait au salon');
    }
    if (request.adresse) errors.push('Pas d’adresse pour un retrait au salon');
    return errors.length
      ? { errors }
      : { fraisLivraison: 0, destination: null, adresse: null };
  }

  const errors: string[] = [];
  const known = [...rates.domicile, ...rates.expedition];
  const rate = request.destination
    ? known.find((r) => r.destination === request.destination)
    : undefined;
  if (!request.destination) {
    errors.push('Choisissez la commune ou la ville de livraison');
  } else if (!rate) {
    errors.push(
      known.length
        ? `Le salon ne livre pas à « ${request.destination} » : choisissez parmi ${known.map((r) => r.destination).join(', ')}`
        : 'Le salon ne propose pas encore la livraison : choisissez le retrait au salon',
    );
  }
  if (!request.adresse || request.adresse.length < 5) {
    errors.push(
      'Indiquez une adresse ou un repère précis (5 caractères au moins)',
    );
  }
  return errors.length || !rate
    ? { errors }
    : {
        fraisLivraison: rate.frais,
        destination: rate.destination,
        adresse: request.adresse!,
      };
};

const STATUS_PHRASES: Record<Statut, string> = {
  en_attente: 'est en attente',
  en_preparation: 'est déjà en préparation',
  prete: 'est déjà expédiée ou prête au retrait',
  livree: 'est déjà livrée ou retirée',
  annulee: 'a été annulée',
};

/** Refus d'une transition de statut : dit où en est la commande */
export const statusConflict = (
  reference: string,
  statut: Statut,
  action: string,
) =>
  `La commande ${reference} ${STATUS_PHRASES[statut]} : elle ne peut pas être ${action}`;
