import { ApiProperty } from '@nestjs/swagger';

/** Format des erreurs renvoyées par l'API */
export class ErrorResponseDto {
  /** @example 400 */
  statusCode: number;

  @ApiProperty({
    description:
      'Explication lisible. Pour une erreur de validation (400), liste des champs refusés.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['Adresse e-mail invalide', 'Au moins 8 caractères'],
  })
  message: string | string[];

  /** @example "Bad Request" */
  error?: string;
}
