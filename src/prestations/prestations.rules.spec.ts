import {
  newCategoryId,
  newPrestationId,
  orderErrors,
  sameName,
  slugify,
} from './prestations.rules';

describe('règles des prestations', () => {
  it('tire un slug du nom, sans accents ni ponctuation', () => {
    expect(slugify('  Coiffure & maquillage ')).toBe('coiffure-maquillage');
    expect(slugify('Pédicure + manucure')).toBe('pedicure-manucure');
  });

  it('rend unique l’identifiant d’une catégorie', () => {
    expect(newCategoryId('Mains', [])).toBe('mains');
    expect(newCategoryId('Mains', ['mains', 'mains-2'])).toBe('mains-3');
    expect(newCategoryId('!!', [])).toBe('categorie');
  });

  it('ne prend jamais un segment de route comme identifiant', () => {
    expect(newCategoryId('Ordre', [])).toBe('ordre-2');
  });

  it('suffixe l’identifiant d’une prestation', () => {
    expect(newPrestationId('Pose mains')).toMatch(/^pose-mains-[0-9a-f]{4}$/);
  });

  it('compare les noms sans casse ni accents', () => {
    expect(sameName('Beauté', 'beaute')).toBe(true);
    expect(sameName('Mains', 'Pieds')).toBe(false);
  });

  it('détaille chaque écart d’un nouvel ordre', () => {
    const existing = [
      { id: 'a', nom: 'Mains' },
      { id: 'b', nom: 'Pieds' },
    ];
    expect(orderErrors(['b', 'a'], existing)).toEqual([]);
    expect(orderErrors([], [])).toEqual([]);
    expect(orderErrors(['a', 'a', 'z'], existing)).toEqual([
      '« Mains » apparaît plusieurs fois',
      '« z » n’existe pas ou a été supprimée',
      '« Pieds » manque dans la liste',
    ]);
  });
});
