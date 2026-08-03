// Modelo del módulo de IA.
//
// Todo lo que dice el usuario y todo lo que responde el asistente va cifrado.
// Fuera del sobre queda lo mínimo para ordenar la conversación y para aplicar
// la política de retención especial del Modo Crisis.
import { z } from 'zod';

export const TIPOS_CONVERSACION = ['general', 'biblia', 'devocional', 'plan', 'pulso'] as const;
export type TipoConversacion = (typeof TIPOS_CONVERSACION)[number];

export const esquemaContenidoConversacion = z.object({ titulo: z.string().max(200) });
export const esquemaContenidoMensaje = z.object({ texto: z.string() });

export interface Conversacion {
  readonly id: string;
  readonly titulo: string;
  readonly tipo: TipoConversacion;
  readonly creadaEn: string;
  readonly actualizadaEn: string;
}

export interface Mensaje {
  readonly id: string;
  readonly conversacionId: string;
  readonly rol: 'usuario' | 'asistente';
  readonly texto: string;
  /** Solo el hecho de que hubo crisis. Nunca cuál fue la señal. */
  readonly categoriaSeguridad: 'crisis' | null;
  readonly creadoEn: string;
}

/**
 * Título a partir del primer mensaje.
 *
 * Se recorta mucho a propósito: aunque va cifrado, un título largo acaba
 * apareciendo en listas, capturas y previsualizaciones.
 */
export function tituloDesde(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length <= 60 ? limpio : `${limpio.slice(0, 59).trimEnd()}…`;
}
