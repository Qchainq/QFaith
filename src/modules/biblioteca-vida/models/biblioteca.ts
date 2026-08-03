// Modelo de la Biblioteca de Vida (Documento 11, módulo 6).
//
// Este módulo lee de los demás, y eso plantea la pregunta importante: ¿dónde
// ocurre la clasificación? **En el dispositivo, después de descifrar.** El
// servidor nunca sabe de qué trata una entrada del diario; solo ve que existe
// una referencia a un registro que ya conocía.
//
// La segunda regla es que aquí no se copia nada. Se guarda una referencia y
// una clasificación. Si se duplicara el contenido, borrar el original dejaría
// un rastro legible en el otro sitio.
import { z } from 'zod';

/** Los diez temas del Documento 11. Son descriptivos, nunca un juicio. */
export const TEMAS = [
  'perdon',
  'fe',
  'esperanza',
  'familia',
  'servicio',
  'ansiedad',
  'gozo',
  'amor',
  'liderazgo',
  'evangelismo',
] as const;
export type Tema = (typeof TEMAS)[number];

/** Módulos que pueden aportar a la biblioteca. */
export const ORIGENES = ['diario', 'oracion', 'habito', 'notaBiblica'] as const;
export type Origen = (typeof ORIGENES)[number];

/**
 * Lo que viaja cifrado.
 *
 * Los temas dicen mucho: «ansiedad» o «perdón» describen un momento de la
 * vida de alguien con más precisión que la mayoría de los metadatos.
 */
export const esquemaContenidoElemento = z.object({
  titulo: z.string().max(200),
  resumen: z.string().max(500),
  temas: z.array(z.enum(TEMAS)).max(TEMAS.length),
});
export type ContenidoElemento = z.infer<typeof esquemaContenidoElemento>;

export interface ElementoBiblioteca extends ContenidoElemento {
  readonly id: string;
  readonly origen: Origen;
  readonly origenId: string;
  readonly ocurridoEn: string | null;
  readonly esFavorito: boolean;
  readonly actualizadoEn: string;
}

/**
 * Lo que un módulo entrega a la biblioteca.
 *
 * Es un contrato, no una dependencia: la Biblioteca no importa nada del
 * Diario ni de Oración. Cada módulo publica lo suyo en esta forma y el
 * contenedor los compone. Así ninguno de los dos conoce al otro.
 */
export interface Aportacion {
  readonly origen: Origen;
  readonly origenId: string;
  readonly titulo: string;
  /** Texto ya descifrado del que se derivan los temas. No se guarda entero. */
  readonly texto: string;
  readonly ocurridoEn: string | null;
}

export interface FuenteBiblioteca {
  aportaciones(): Promise<readonly Aportacion[]>;
}

/** Resumen corto para la ficha. Nunca el texto completo: no se duplica. */
export function resumir(texto: string, limite = 160): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= limite ? limpio : `${limpio.slice(0, limite - 1).trimEnd()}…`;
}
