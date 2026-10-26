import type { TransformFnParams } from 'class-transformer';

// Transformations appliquées par le ValidationPipe avant la validation des DTO

export const normalizeEmail = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const trim = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.trim() : value;

// Numéros ivoiriens : 10 chiffres, avec ou sans l'indicatif +225.
// Résultat : « +225 07 00 00 00 00 », le format affiché par le site
export const normalizePhone = ({ value }: TransformFnParams): unknown => {
  if (typeof value !== 'string') return value;
  if (value.trim() === '') return undefined;
  let digits = value.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('225'))
    digits = digits.slice(3);
  if (digits.length !== 10) return value;
  return `+225 ${digits.replace(/(\d{2})(?=\d)/g, '$1 ')}`;
};
