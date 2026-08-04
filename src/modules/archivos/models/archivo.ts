// Modelo de los archivos privados.
//
// Fotografías, audios y documentos que alguien adjunta a su diario, a una
// oración, a un memorial o a la nota de un sermón. Es lo más delicado que
// guarda la aplicación: la foto de un padre que murió, la grabación de una
// oración dicha llorando.
//
// Tres cosas que este archivo decide y que conviene no perder de vista:
//
//   1. **El nombre original es contenido privado.** «carta-de-mi-madre.pdf»
//      cuenta casi tanto como el documento. Viaja cifrado y nunca aparece en
//      una ruta, en un log ni en un mensaje de error (invariante 2).
//
//   2. **El tipo es una lista cerrada.** No porque sea más seguro comprobarlo
//      aquí —el servidor lo comprueba también—, sino porque una lista abierta
//      acaba convirtiéndose en un campo de texto por el que se cuela otra
//      cosa.
//
//   3. **El límite de tamaño es del producto, no del servidor.** Cifrar
//      cincuenta megas en un teléfono modesto ya es lento; subirlos por una
//      conexión mala, peor. Es mejor decirlo antes de empezar que fallar a la
//      mitad.
import { z } from 'zod';

/** A qué se puede adjuntar un archivo (Documento 12, tabla 15). */
export const ORIGENES_ARCHIVO = ['journal', 'prayer', 'memorial', 'sermon_note'] as const;
export type OrigenArchivo = (typeof ORIGENES_ARCHIVO)[number];

/**
 * Tipos que la aplicación sabe enseñar. Ver decisión 2.
 *
 * Coincide exactamente con la restricción de la migración 0016: si aquí se
 * añade uno y allí no, el archivo se cifra y se sube para que el servidor lo
 * rechace después, con el trabajo ya hecho.
 */
export const TIPOS_ARCHIVO = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'audio/m4a',
  'audio/mpeg',
  'audio/wav',
  'application/pdf',
] as const;
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

/** Estado de la subida. Que sea `pendiente` es normal, no un error. */
export const ESTADOS_SUBIDA = ['pending', 'uploading', 'uploaded', 'failed'] as const;
export type EstadoSubida = (typeof ESTADOS_SUBIDA)[number];

/** 50 MiB. Ver decisión 3. Igual que el límite del cubo y de la tabla. */
export const TAMANO_MAXIMO_BYTES = 52_428_800;

/** Lo que ve la pantalla. Nunca incluye los bytes: se piden aparte. */
export interface Archivo {
  readonly id: string;
  readonly origen: OrigenArchivo;
  readonly origenId: string;
  readonly tipo: TipoArchivo;
  /** Descifrado. Puede estar vacío si el origen no traía nombre. */
  readonly nombre: string;
  readonly tamanoBytes: number;
  readonly estadoSubida: EstadoSubida;
  readonly creadoEn: string;
}

export interface BorradorArchivo {
  readonly origen: OrigenArchivo;
  readonly origenId: string;
  readonly tipo: TipoArchivo;
  readonly nombre: string;
  readonly contenido: Uint8Array;
}

/**
 * Lo único que se guarda cifrado del archivo aparte de sus bytes.
 *
 * Va en un sobre propio y no junto al blob porque la pantalla necesita
 * enseñar la lista de adjuntos —con sus nombres— sin descargar cada archivo.
 */
export const esquemaContenidoArchivo = z.object({
  nombre: z.string().default(''),
});

export type ContenidoArchivo = z.infer<typeof esquemaContenidoArchivo>;

export const esTipoAdmitido = (valor: unknown): valor is TipoArchivo =>
  typeof valor === 'string' && (TIPOS_ARCHIVO as readonly string[]).includes(valor);

export const esOrigenValido = (valor: unknown): valor is OrigenArchivo =>
  typeof valor === 'string' && (ORIGENES_ARCHIVO as readonly string[]).includes(valor);

export const esEstadoSubida = (valor: unknown): valor is EstadoSubida =>
  typeof valor === 'string' && (ESTADOS_SUBIDA as readonly string[]).includes(valor);

/** Motivo por el que un archivo no se puede adjuntar, o `null` si se puede. */
export type MotivoRechazo = 'tipoNoAdmitido' | 'vacio' | 'demasiadoGrande';

/**
 * Comprueba un archivo **antes** de cifrarlo.
 *
 * El orden importa: primero el tipo, que es lo barato, y el tamaño después.
 * Al revés, un vídeo de un giga con extensión rara haría trabajar para nada.
 */
export function motivoDeRechazo(borrador: {
  readonly tipo: string;
  readonly contenido: Uint8Array;
}): MotivoRechazo | null {
  if (!esTipoAdmitido(borrador.tipo)) return 'tipoNoAdmitido';
  if (borrador.contenido.length === 0) return 'vacio';
  if (borrador.contenido.length > TAMANO_MAXIMO_BYTES) return 'demasiadoGrande';
  return null;
}

/**
 * Ruta del archivo en el cubo.
 *
 * `{usuario}/{archivo}` y nada más. Sin nombre, sin extensión y sin fecha: una
 * ruta es lo primero que aparece en el registro de un servidor, y el
 * invariante 2 prohíbe que ahí figure el nombre de un archivo privado. La
 * migración 0016 comprueba esta misma forma con una restricción, así que un
 * cambio aquí sin cambiarla allí deja de escribir.
 */
export const rutaEnCubo = (usuarioId: string, archivoId: string): string =>
  `${usuarioId}/${archivoId}`;

/** Nombre visible cuando el original se perdió o nunca existió. */
export function nombreParaMostrar(archivo: Archivo): string {
  if (archivo.nombre.length > 0) return archivo.nombre;
  if (archivo.tipo.startsWith('image/')) return 'archivos.sinNombre.imagen';
  if (archivo.tipo.startsWith('audio/')) return 'archivos.sinNombre.audio';
  return 'archivos.sinNombre.documento';
}
