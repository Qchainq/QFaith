// Modelo de Sermones (Documento 11 y Documento 12, tablas 26 a 28).
//
// El módulo tiene dos mitades con dueños distintos y este archivo las
// mantiene separadas: `Sermon` es institucional y va en claro; `NotaSermon` y
// `AccionSermon` son de quien las escribe y van cifradas.
//
// La frontera no es un detalle de implementación: es lo que permite tomar
// notas con libertad durante una predicación. **Nadie de la iglesia las lee,
// ni siquiera quien predicó.**
import { z } from 'zod';

export const ESTADOS_PUBLICACION = ['draft', 'published', 'archived'] as const;
export type EstadoPublicacion = (typeof ESTADOS_PUBLICACION)[number];

export interface Sermon {
  readonly id: string;
  /** Iglesia que lo publicó, o `null` si es un sermón guardado por la persona. */
  readonly iglesiaId: string | null;
  readonly titulo: string | null;
  readonly predicador: string | null;
  readonly fecha: string | null;
  readonly resumen: string | null;
  readonly referencias: readonly string[];
  readonly audio: string | null;
  readonly video: string | null;
  readonly estado: EstadoPublicacion;
}

/** Lo que viaja cifrado de una nota. */
export const esquemaContenidoNota = z.object({
  texto: z.string(),
  destacados: z.array(z.string().max(300)).max(50),
});

export type ContenidoNota = z.infer<typeof esquemaContenidoNota>;

export interface NotaSermon extends ContenidoNota {
  readonly id: string;
  readonly sermonId: string | null;
  readonly creadaEn: string;
  readonly actualizadaEn: string;
}

/** Lo que viaja cifrado de una acción. El texto lo dice todo. */
export const esquemaContenidoAccion = z.object({ texto: z.string().max(300) });

export interface AccionSermon {
  readonly id: string;
  readonly notaId: string | null;
  readonly texto: string;
  /** En claro: es lo que necesita un recordatorio para saber cuándo sonar. */
  readonly fechaLimite: string | null;
  readonly completadaEn: string | null;
  readonly recordatorio: boolean;
}

export interface BorradorNota extends ContenidoNota {
  readonly id?: string;
  readonly sermonId?: string | null;
}

export const esquemaBorradorNota = z.object({
  texto: z.string().trim().min(1, 'sermones.errores.notaVacia'),
  destacados: z.array(z.string().trim().min(1).max(300)).max(50),
});

export const esquemaBorradorAccion = z.object({
  texto: z
    .string()
    .trim()
    .min(1, 'sermones.errores.accionVacia')
    .max(300, 'sermones.errores.accionLarga'),
  fechaLimite: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'sermones.errores.fechaInvalida')
    .nullable(),
});

export interface BorradorAccion {
  readonly id?: string;
  readonly notaId?: string | null;
  readonly texto: string;
  readonly fechaLimite?: string | null;
  readonly recordatorio?: boolean;
}

/**
 * Acciones pendientes, las más urgentes primero.
 *
 * Las que no tienen fecha van al final: no se les inventa una para poder
 * ordenarlas, igual que en el Memorial.
 */
export function pendientesPrimero(acciones: readonly AccionSermon[]): readonly AccionSermon[] {
  return [...acciones]
    .filter((accion) => accion.completadaEn === null)
    .sort((a, b) => {
      if (a.fechaLimite === null && b.fechaLimite === null) return 0;
      if (a.fechaLimite === null) return 1;
      if (b.fechaLimite === null) return -1;
      return a.fechaLimite.localeCompare(b.fechaLimite);
    });
}
