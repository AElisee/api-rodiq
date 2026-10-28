import { addDays } from '../reservations/reservations.rules';

// Journal d'activité : connexions et actions qui modifient les données (ajout, modification,
// suppression, changement de statut, annulation…). Les lectures ne sont pas journalisées.

export const CATEGORIES = [
  'connexion',
  'reservation',
  'commande',
  'boutique',
  'prestation',
  'reglage',
] as const;
export type Categorie = (typeof CATEGORIES)[number];

// Auteur d'une entrée : `anonyme` = personne non connectée (tentative de connexion refusée)
export const ACTEURS = ['client', 'admin', 'anonyme'] as const;
export type TypeActeur = (typeof ACTEURS)[number];

export const RESULTATS = ['succes', 'echec'] as const;
export type Resultat = (typeof RESULTATS)[number];

// Élément touché par l'action ; le front s'en sert pour ouvrir sa fiche
export const TYPES_CIBLE = [
  'espace',
  'compte',
  'reservation',
  'commande',
  'produit',
  'categorie_produits',
  'prestation',
  'categorie_prestations',
  'reglages',
] as const;
export type TypeCible = (typeof TYPES_CIBLE)[number];

// Catalogue des actions. Les codes sont stockés en base : n'en retirer aucun, seuls les libellés
// (relus à chaque lecture) peuvent changer
export const ACTIONS = {
  'connexion.reussie': { categorie: 'connexion', libelle: 'Connexion' },
  'connexion.refusee': { categorie: 'connexion', libelle: 'Connexion refusée' },
  deconnexion: { categorie: 'connexion', libelle: 'Déconnexion' },
  'compte.cree': { categorie: 'connexion', libelle: 'Inscription' },

  'reservation.creee': {
    categorie: 'reservation',
    libelle: 'Réservation demandée',
  },
  'reservation.annulee': {
    categorie: 'reservation',
    libelle: 'Réservation annulée',
  },
  'reservation.confirmee': {
    categorie: 'reservation',
    libelle: 'Réservation confirmée',
  },
  'reservation.refusee': {
    categorie: 'reservation',
    libelle: 'Réservation refusée',
  },
  'reservation.terminee': { categorie: 'reservation', libelle: 'Soin terminé' },

  'commande.creee': { categorie: 'commande', libelle: 'Commande passée' },
  'commande.annulee': { categorie: 'commande', libelle: 'Commande annulée' },
  'commande.acceptee': { categorie: 'commande', libelle: 'Commande acceptée' },
  'commande.prete': {
    categorie: 'commande',
    libelle: 'Commande expédiée ou prête au retrait',
  },
  'commande.remise': {
    categorie: 'commande',
    libelle: 'Commande livrée ou retirée',
  },
  'commande.encaissee': { categorie: 'commande', libelle: 'Paiement encaissé' },

  'boutique.categorie.ajoutee': {
    categorie: 'boutique',
    libelle: 'Catégorie de produits ajoutée',
  },
  'boutique.categorie.modifiee': {
    categorie: 'boutique',
    libelle: 'Catégorie de produits modifiée',
  },
  'boutique.categorie.supprimee': {
    categorie: 'boutique',
    libelle: 'Catégorie de produits supprimée',
  },
  'boutique.categories.ordonnees': {
    categorie: 'boutique',
    libelle: 'Catégories de produits réordonnées',
  },
  'produit.ajoute': { categorie: 'boutique', libelle: 'Produit ajouté' },
  'produit.modifie': { categorie: 'boutique', libelle: 'Produit modifié' },
  'produit.supprime': { categorie: 'boutique', libelle: 'Produit supprimé' },
  'produit.photo.ajoutee': { categorie: 'boutique', libelle: 'Photo ajoutée' },
  'produit.photo.retiree': { categorie: 'boutique', libelle: 'Photo retirée' },
  'produit.photos.ordonnees': {
    categorie: 'boutique',
    libelle: 'Photos réordonnées',
  },

  'prestation.categorie.ajoutee': {
    categorie: 'prestation',
    libelle: 'Catégorie de prestations ajoutée',
  },
  'prestation.categorie.modifiee': {
    categorie: 'prestation',
    libelle: 'Catégorie de prestations modifiée',
  },
  'prestation.categorie.supprimee': {
    categorie: 'prestation',
    libelle: 'Catégorie de prestations supprimée',
  },
  'prestation.categories.ordonnees': {
    categorie: 'prestation',
    libelle: 'Catégories de prestations réordonnées',
  },
  'prestations.ordonnees': {
    categorie: 'prestation',
    libelle: 'Prestations réordonnées',
  },
  'prestation.ajoutee': {
    categorie: 'prestation',
    libelle: 'Prestation ajoutée',
  },
  'prestation.modifiee': {
    categorie: 'prestation',
    libelle: 'Prestation modifiée',
  },
  'prestation.supprimee': {
    categorie: 'prestation',
    libelle: 'Prestation supprimée',
  },

  'reglages.crees': { categorie: 'reglage', libelle: 'Salon configuré' },
  'reglages.plateforme': {
    categorie: 'reglage',
    libelle: 'Plateforme modifiée',
  },
  'reglages.logo.importe': { categorie: 'reglage', libelle: 'Logo importé' },
  'reglages.logo.retire': { categorie: 'reglage', libelle: 'Logo retiré' },
  'reglages.horaires': {
    categorie: 'reglage',
    libelle: 'Horaires et créneaux modifiés',
  },
  'reglages.regles': {
    categorie: 'reglage',
    libelle: 'Règles de réservation modifiées',
  },
  'reglages.fermeture.ajoutee': {
    categorie: 'reglage',
    libelle: 'Jour de fermeture ajouté',
  },
  'reglages.fermeture.retiree': {
    categorie: 'reglage',
    libelle: 'Jour de fermeture retiré',
  },
  'reglages.salon': {
    categorie: 'reglage',
    libelle: 'Adresse du salon modifiée',
  },
  'reglages.livraisons': {
    categorie: 'reglage',
    libelle: 'Livraisons modifiées',
  },
} as const satisfies Record<string, { categorie: Categorie; libelle: string }>;

export type Action = keyof typeof ACTIONS;

/** Libellé d'une action enregistrée ; un code inconnu (catalogue plus ancien) s'affiche tel quel */
export const libelleAction = (code: string) =>
  (ACTIONS as Record<string, { libelle: string }>)[code]?.libelle ?? code;

// Entrées plus anciennes supprimées : un an d'historique suffit pour retrouver une action ou une
// connexion suspecte, sans garder indéfiniment adresses IP et navigateurs
export const CONSERVATION_JOURS = 365;

/** Texte tronqué à la taille de sa colonne ; null s'il est vide */
export const tronquer = (texte: unknown, max: number) => {
  if (typeof texte !== 'string') return null;
  const propre = texte.trim().replace(/\s+/g, ' ');
  if (!propre) return null;
  return propre.length > max ? `${propre.slice(0, max - 1)}…` : propre;
};

/** Écarts d'une période demandée (`du` et `au` compris, l'un ou l'autre facultatif) et du jour affiché */
export const periodeErrors = (du?: string, au?: string, jour?: string) => {
  const errors: string[] = [];
  if (du && au && du > au) {
    errors.push(`La date de début (${du}) est après la date de fin (${au})`);
  }
  if (jour && du && jour < du) {
    errors.push(`Le jour affiché (${jour}) est avant la date de début (${du})`);
  }
  if (jour && au && jour > au) {
    errors.push(`Le jour affiché (${jour}) est après la date de fin (${au})`);
  }
  return errors;
};

/** Bornes UTC (= heure d'Abidjan) d'une période en jours : [début, fin[ */
export const bornesPeriode = (du?: string, au?: string) => ({
  depuis: du ? new Date(`${du}T00:00:00Z`) : undefined,
  avant: au ? new Date(`${addDays(au, 1)}T00:00:00Z`) : undefined,
});

/**
 * Décalage (`+01:00`) du fuseau du processus Node à un instant : TypeORM écrit les dates à cette heure-là
 * (fuseau `local`), on les ramène en UTC (= Abidjan) avant d'en tirer le jour en SQL
 */
export const decalageFuseau = (date = new Date()) => {
  const minutes = -date.getTimezoneOffset();
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};
