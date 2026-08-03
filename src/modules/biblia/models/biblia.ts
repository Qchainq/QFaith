// Modelo del módulo Biblia (Documento 11, módulo 2).
//
// Es el primer módulo con **dos naturalezas** dentro. Conviene tenerlas
// separadas también en los tipos, porque las reglas son opuestas:
//
//   · El texto bíblico es público, compartido y licenciado por un tercero. No
//     pertenece a la persona y no se cifra.
//   · Lo que ella escribe sobre un pasaje es suyo, privado y cifrado.
import { z } from 'zod';

// ── Contenido público ────────────────────────────────────────────────────

export interface Traduccion {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly idioma: string;
  readonly disponibleSinConexion: boolean;
}

export interface Libro {
  readonly codigo: string;
  readonly nombre: string;
  readonly testamento: 'antiguo' | 'nuevo';
  readonly orden: number;
  readonly capitulos: number;
}

export interface Versiculo {
  readonly libro: string;
  readonly capitulo: number;
  readonly numero: number;
  readonly texto: string;
}

/** Dónde está una nota. Se guarda en claro para poder situarla sin descifrar. */
export interface Referencia {
  readonly libro: string;
  readonly capitulo: number;
  readonly versiculoInicio: number | null;
  readonly versiculoFin: number | null;
}

// ── Contenido privado ────────────────────────────────────────────────────

/** Lo que viaja cifrado de una nota bíblica. */
export const esquemaContenidoNota = z.object({ texto: z.string() });
export type ContenidoNota = z.infer<typeof esquemaContenidoNota>;

export interface NotaBiblica extends ContenidoNota, Referencia {
  readonly id: string;
  readonly traduccionId: string | null;
  readonly creadaEn: string;
  readonly actualizadaEn: string;
}

export interface BorradorNota extends Referencia {
  readonly id?: string;
  readonly texto: string;
  readonly traduccionId?: string | null;
}

export const esquemaBorradorNota = z.object({
  texto: z.string().trim().min(1, 'biblia.errores.notaVacia'),
  libro: z.string().min(1),
  capitulo: z.number().int().positive(),
  versiculoInicio: z.number().int().positive().nullable(),
  versiculoFin: z.number().int().positive().nullable(),
});

/** Cómo se escribe una referencia para mostrarla: «Juan 3:16» o «Juan 3». */
export function formatearReferencia(
  nombreLibro: string,
  referencia: Pick<Referencia, 'capitulo' | 'versiculoInicio' | 'versiculoFin'>,
): string {
  if (referencia.versiculoInicio === null) {
    return `${nombreLibro} ${referencia.capitulo}`;
  }
  const fin =
    referencia.versiculoFin === null || referencia.versiculoFin === referencia.versiculoInicio
      ? ''
      : `-${referencia.versiculoFin}`;
  return `${nombreLibro} ${referencia.capitulo}:${referencia.versiculoInicio}${fin}`;
}
