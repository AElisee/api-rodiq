import {
  decodePhoto,
  newProductCategoryId,
  newProductId,
  productErrors,
  productLevel,
  publicQuantity,
  variantErrors,
} from './boutique.rules';

const dataUrl = (type: string, bytes: number[]) =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

const JPEG = [0xff, 0xd8, 0xff, 0xe0, ...Array<number>(20).fill(0)];
const PNG = [137, 80, 78, 71, 13, 10, 26, 10, ...Array<number>(20).fill(0)];

describe('règles de la boutique', () => {
  it('ne prend jamais un segment de route comme identifiant de catégorie', () => {
    expect(newProductCategoryId('Vernis', ['vernis'])).toBe('vernis-2');
    expect(newProductCategoryId('Ordre', [])).toBe('ordre-2');
  });

  it('suffixe l’identifiant d’un produit de 6 caractères aléatoires', () => {
    expect(newProductId('Vernis nude rosé')).toMatch(
      /^vernis-nude-rose-[0-9a-f]{6}$/,
    );
  });

  it('retient le niveau le plus critique', () => {
    expect(productLevel(10, [], 3)).toBe('ok');
    expect(productLevel(3, [], 3)).toBe('faible');
    expect(productLevel(99, [{ stock: 5 }, { stock: 0 }], 3)).toBe('epuise');
    expect(productLevel(0, [{ stock: 2 }, { stock: 9 }], 3)).toBe('faible');
  });

  it('plafonne la quantité annoncée au site', () => {
    expect(publicQuantity(250)).toBe(10);
    expect(publicQuantity(4)).toBe(4);
    expect(publicQuantity(0)).toBe(0);
  });

  it('vérifie prix barré et stock', () => {
    expect(productErrors({ prix: 6000, stock: 1, declinaisons: [] })).toEqual(
      [],
    );
    expect(
      productErrors({ prix: 6000, prixBarre: 6000, declinaisons: [] }),
    ).toEqual([
      'Le prix barré (6000 FCFA) doit être supérieur au prix de vente (6000 FCFA)',
      'Indiquez la quantité en stock du produit',
    ]);
    expect(
      productErrors({ prix: 1, stock: 4, declinaisons: [{}] }),
    ).toHaveLength(1);
  });

  it('détaille chaque écart des déclinaisons', () => {
    expect(
      variantErrors(
        [
          { id: 'aaaaaaaa', nom: 'Rose' },
          { nom: 'rosé' },
          { id: 'bbbbbbbb', nom: 'Bleu' },
        ],
        ['aaaaaaaa'],
      ),
    ).toEqual([
      'Deux déclinaisons portent le même nom : « Rose » et « rosé »',
      'La déclinaison « Bleu » n’appartient pas à ce produit ou a été supprimée : rechargez la fiche',
    ]);
  });

  it('accepte une vraie image du type annoncé', () => {
    const photo = decodePhoto(dataUrl('image/jpeg', JPEG));
    expect('error' in photo ? photo.error : photo.type).toBe('image/jpeg');
  });

  it('refuse un contenu qui ne correspond pas au type annoncé', () => {
    expect(decodePhoto(dataUrl('image/jpeg', PNG))).toEqual({
      error: 'Photo refusée : le fichier n’est pas une vraie image JPEG',
    });
  });

  it('refuse le SVG et tout ce qui n’est pas une data URL d’image', () => {
    expect('error' in decodePhoto('data:image/svg+xml;base64,PHN2Zz4=')).toBe(
      true,
    );
    expect('error' in decodePhoto('https://exemple.com/a.jpg')).toBe(true);
  });
});
