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

// ── Subrayados y marcadores ──────────────────────────────────────────────
//
// Van aquí y no en un módulo aparte porque subrayar y marcar son parte de
// leer, no otra cosa. Comparten la referencia con las notas y se pintan sobre
// el mismo capítulo.

/**
 * Estilos de subrayado. Los del Design System y ninguno más.
 *
 * Coincide exactamente con la restricción de la migración 0018: si aquí se
 * añadiera uno y allí no, el subrayado se guardaría en local y el servidor lo
 * rechazaría al sincronizar, mucho después y lejos de donde se causó.
 */
export const ESTILOS_SUBRAYADO = [
  'amarillo',
  'verde',
  'azul',
  'rosa',
  'naranja',
  'subrayado',
] as const;
export type EstiloSubrayado = (typeof ESTILOS_SUBRAYADO)[number];

/** Lo que viaja cifrado de un subrayado: lo que escribió al marcarlo. */
export const esquemaContenidoSubrayado = z.object({ nota: z.string().default('') });

export interface Subrayado {
  readonly id: string;
  readonly traduccionId: string;
  readonly libro: string;
  readonly capitulo: number;
  readonly versiculoInicio: number;
  readonly versiculoFin: number;
  readonly estilo: EstiloSubrayado;
  /** Descifrada. Vacía si no escribió nada, que es lo normal. */
  readonly nota: string;
  readonly creadoEn: string;
}

export interface BorradorSubrayado {
  readonly traduccionId: string;
  readonly libro: string;
  readonly capitulo: number;
  readonly versiculoInicio: number;
  readonly versiculoFin: number;
  readonly estilo: EstiloSubrayado;
  readonly nota?: string;
}

export interface Marcador {
  readonly id: string;
  readonly traduccionId: string;
  readonly libro: string;
  readonly capitulo: number;
  /** Nulo cuando se marca el capítulo entero, que es lo habitual. */
  readonly versiculo: number | null;
  readonly creadoEn: string;
}

export const esEstiloSubrayado = (valor: unknown): valor is EstiloSubrayado =>
  typeof valor === 'string' && (ESTILOS_SUBRAYADO as readonly string[]).includes(valor);

/**
 * Ordena un rango que llega al revés.
 *
 * Seleccionar del versículo 8 al 3 arrastrando hacia arriba es tan normal como
 * hacerlo al revés, y el esquema exige que el final no sea menor que el
 * principio. Corregirlo aquí evita un error que la persona no entendería:
 * para ella marcó el mismo trozo.
 */
export function ordenarRango(
  inicio: number,
  fin: number,
): {
  readonly versiculoInicio: number;
  readonly versiculoFin: number;
} {
  return inicio <= fin
    ? { versiculoInicio: inicio, versiculoFin: fin }
    : { versiculoInicio: fin, versiculoFin: inicio };
}

/** ¿Este subrayado toca este versículo? Sirve para pintarlo. */
export const cubreVersiculo = (subrayado: Subrayado, versiculo: number): boolean =>
  versiculo >= subrayado.versiculoInicio && versiculo <= subrayado.versiculoFin;

/**
 * Subrayados que tocan un versículo, en el orden en que se pintan.
 *
 * Los solapados no se funden —eso perdería lo que la persona marcó y la nota
 * de uno de los dos—, así que puede haber varios sobre el mismo versículo. Se
 * devuelven del más antiguo al más reciente, para que lo último que marcó
 * quede encima, como con dos rotuladores sobre papel.
 */
export const subrayadosDe = (
  subrayados: readonly Subrayado[],
  versiculo: number,
): readonly Subrayado[] =>
  subrayados
    .filter((subrayado) => cubreVersiculo(subrayado, versiculo))
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
