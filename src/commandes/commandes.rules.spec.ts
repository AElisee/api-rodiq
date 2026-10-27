import {
  type CatalogProduct,
  duplicateLineErrors,
  newReference,
  resolveDelivery,
  resolveLines,
  statusConflict,
  subtotal,
} from './commandes.rules';

const catalog = (...products: CatalogProduct[]) =>
  new Map(products.map((p) => [p.id, p]));

const huile: CatalogProduct = {
  id: 'huile-3f2a1b',
  nom: 'Huile cuticules',
  prix: 3000,
  stock: 4,
  masque: false,
  declinaisons: [],
};

const vernis: CatalogProduct = {
  id: 'vernis-9b1c2d',
  nom: 'Vernis gel',
  prix: 4500,
  stock: 0,
  masque: false,
  declinaisons: [
    { id: 'rose0001', nom: 'Rose poudré', stock: 2 },
    { id: 'rouge001', nom: 'Rouge', stock: 0 },
  ],
};

const rates = {
  domicile: [{ destination: 'Cocody', frais: 2000 }],
  expedition: [{ destination: 'Bouaké', frais: 4000 }],
};

describe('resolveLines', () => {
  it('fige nom et prix du catalogue', () => {
    expect(
      resolveLines(
        [
          { produitId: huile.id, quantite: 2 },
          { produitId: vernis.id, declinaisonId: 'rose0001', quantite: 1 },
        ],
        catalog(huile, vernis),
      ),
    ).toEqual({
      lignes: [
        {
          produitId: huile.id,
          declinaisonId: null,
          nom: 'Huile cuticules',
          declinaison: null,
          prixUnitaire: 3000,
          quantite: 2,
        },
        {
          produitId: vernis.id,
          declinaisonId: 'rose0001',
          nom: 'Vernis gel',
          declinaison: 'Rose poudré',
          prixUnitaire: 4500,
          quantite: 1,
        },
      ],
    });
  });

  it('liste chaque écart', () => {
    const result = resolveLines(
      [
        { produitId: 'inconnu', quantite: 1 },
        { produitId: 'masque', quantite: 1 },
        { produitId: vernis.id, quantite: 1 },
        { produitId: vernis.id, declinaisonId: 'zzz', quantite: 1 },
        { produitId: vernis.id, declinaisonId: 'rouge001', quantite: 1 },
        { produitId: huile.id, declinaisonId: 'rose0001', quantite: 1 },
        { produitId: huile.id, quantite: 5 },
      ],
      catalog(huile, vernis, {
        ...huile,
        id: 'masque',
        nom: 'Lime',
        masque: true,
      }),
    );
    expect(result).toEqual({
      errors: [
        'Le produit « inconnu » n’existe plus : retirez-le du panier',
        '« Lime » n’est plus en vente : retirez-le du panier',
        'Choisissez une déclinaison de « Vernis gel » (Rose poudré, Rouge)',
        'La déclinaison choisie de « Vernis gel » n’existe plus : choisissez-en une autre',
        '« Vernis gel · Rouge » est épuisé : retirez-le du panier',
        '« Huile cuticules » n’a plus de déclinaisons : rechargez la fiche du produit',
        'Il ne reste que 4 « Huile cuticules » : 5 demandés',
      ],
    });
  });

  it('ne révèle pas un stock au-delà de la quantité maximale par ligne', () => {
    const result = resolveLines(
      [{ produitId: huile.id, quantite: 10 }],
      catalog({ ...huile, stock: 9 }),
    );
    expect(result).toEqual({
      errors: ['Il ne reste que 9 « Huile cuticules » : 10 demandés'],
    });
  });
});

describe('duplicateLineErrors', () => {
  it('refuse le même article sur deux lignes, pas deux déclinaisons', () => {
    expect(
      duplicateLineErrors([
        { produitId: 'a', quantite: 1 },
        { produitId: 'a', quantite: 2 },
        { produitId: 'b', declinaisonId: 'x', quantite: 1 },
        { produitId: 'b', declinaisonId: 'y', quantite: 1 },
      ]),
    ).toHaveLength(1);
  });
});

describe('resolveDelivery', () => {
  it('retrait : pas de frais ni d’adresse', () => {
    expect(resolveDelivery(rates, { mode: 'retrait' })).toEqual({
      fraisLivraison: 0,
      destination: null,
      adresse: null,
    });
    expect(
      resolveDelivery(rates, { mode: 'retrait', adresse: 'Angré' }),
    ).toEqual({ errors: ['Pas d’adresse pour un retrait au salon'] });
  });

  it('livraison : frais des réglages, domicile ou expédition', () => {
    expect(
      resolveDelivery(rates, {
        mode: 'livraison',
        destination: 'Bouaké',
        adresse: 'Quartier Commerce',
      }),
    ).toEqual({
      fraisLivraison: 4000,
      destination: 'Bouaké',
      adresse: 'Quartier Commerce',
    });
  });

  it('livraison : destination non desservie et adresse manquante', () => {
    const result = resolveDelivery(rates, {
      mode: 'livraison',
      destination: 'Paris',
    });
    expect('errors' in result && result.errors).toEqual([
      'Le salon ne livre pas à « Paris » : choisissez parmi Cocody, Bouaké',
      'Indiquez une adresse ou un repère précis (5 caractères au moins)',
    ]);
  });
});

it('subtotal multiplie prix et quantités', () => {
  expect(
    subtotal([
      { prixUnitaire: 3000, quantite: 2 },
      { prixUnitaire: 4500, quantite: 1 },
    ]),
  ).toBe(10500);
});

it('newReference : CMD- et 6 caractères non ambigus', () => {
  expect(newReference()).toMatch(/^CMD-[A-HJ-NP-Z2-9]{6}$/);
});

it('statusConflict dit où en est la commande', () => {
  expect(statusConflict('CMD-ABC234', 'livree', 'annulée')).toBe(
    'La commande CMD-ABC234 est déjà livrée ou retirée : elle ne peut pas être annulée',
  );
});
