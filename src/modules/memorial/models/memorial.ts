// Modelo del Memorial (Documento 11, y tabla 13 del Documento 12).
//
// Es el registro de lo que alguien vio que Dios hizo. Todo el texto va
// cifrado; fuera del sobre solo queda la fecha del recuerdo, si es favorito y
// de qué petición nació.
import { z } from 'zod';

/**
 * Lo que viaja cifrado.
 *
 * `personas` está aquí por la misma razón que en Oración: son nombres de
 * terceros que nunca dieron su consentimiento para aparecer en un servidor.
 */
export const esquemaContenidoMemorial = z.object({
  titulo: z.string().max(200),
  relato: z.string(),
  personas: z.array(z.string().max(120)).max(50),
});

export type ContenidoMemorial = z.infer<typeof esquemaContenidoMemorial>;

export interface Memorial extends ContenidoMemorial {
  readonly id: string;
  /** Petición de la que nació, si nació de una. */
  readonly peticionId: string | null;
  /**
   * Día en que ocurrió, en formato `AAAA-MM-DD`.
   *
   * Fecha y no instante: nadie recuerda a qué hora pasó algo importante, y un
   * instante cambiaría de día al cruzar una zona horaria.
   */
  readonly ocurrioEl: string | null;
  readonly favorito: boolean;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

export interface BorradorMemorial extends ContenidoMemorial {
  readonly id?: string;
  readonly peticionId?: string | null;
  readonly ocurrioEl?: string | null;
  readonly favorito?: boolean;
}

export const esquemaBorradorMemorial = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'memorial.errores.tituloVacio')
    .max(200, 'memorial.errores.tituloLargo'),
  relato: z.string().trim(),
  personas: z
    .array(z.string().trim().min(1).max(120))
    .max(50, 'memorial.errores.demasiadasPersonas'),
  ocurrioEl: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'memorial.errores.fechaInvalida')
    .nullable(),
});

/**
 * Año de un memorial, para agrupar la cronología.
 *
 * Los que no tienen fecha se agrupan aparte en lugar de colarse en el año en
 * curso: decirle a alguien que algo pasó este año cuando no lo sabe es
 * inventarle un recuerdo.
 */
export const anoDe = (memorial: Memorial): string | null =>
  memorial.ocurrioEl === null ? null : memorial.ocurrioEl.slice(0, 4);
