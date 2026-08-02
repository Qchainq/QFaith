// Modelo del módulo de Oración (Documento 11, módulo 3).
//
// Igual que en el Diario, lo que decide la privacidad es en qué lado de la
// frontera cae cada campo. Aquí hay una diferencia importante: el **estado**
// y la **categoría** viajan en claro, porque el servidor los necesita para
// los recordatorios y para no descargar toda la vida de oración de alguien
// cada vez. A cambio, son códigos cerrados, nunca texto de la persona.
import { z } from 'zod';

/** Coincide con el enum `prayer_status` del esquema. */
export const ESTADOS_PETICION = ['active', 'answered', 'archived'] as const;
export type EstadoPeticion = (typeof ESTADOS_PETICION)[number];

/** Categorías del Documento 11. Códigos, no etiquetas escritas por el usuario. */
export const CATEGORIAS_PETICION = [
  'personal',
  'familia',
  'iglesia',
  'trabajo',
  'salud',
  'finanzas',
  'amigos',
  'ministerio',
] as const;
export type CategoriaPeticion = (typeof CATEGORIAS_PETICION)[number];

/**
 * Lo que viaja cifrado.
 *
 * `personas` es lo más delicado del módulo: son nombres de terceros que nunca
 * dieron su consentimiento para aparecer en un servidor. No salen del
 * dispositivo en claro bajo ningún concepto.
 */
export const esquemaContenidoPeticion = z.object({
  titulo: z.string().max(200),
  detalle: z.string(),
  personas: z.array(z.string().max(120)).max(50),
});

export type ContenidoPeticion = z.infer<typeof esquemaContenidoPeticion>;

export interface Peticion extends ContenidoPeticion {
  readonly id: string;
  readonly estado: EstadoPeticion;
  readonly categoria: CategoriaPeticion | null;
  readonly recordatorioActivo: boolean;
  /** Instante UTC del próximo recordatorio, o null si no hay. */
  readonly proximoRecordatorio: string | null;
  readonly respondidaEn: string | null;
  readonly archivadaEn: string | null;
  readonly creadaEn: string;
  readonly actualizadaEn: string;
}

/** Avance anotado sobre una petición. Se guarda aparte para no perder el recorrido. */
export interface AvancePeticion {
  readonly id: string;
  readonly peticionId: string;
  readonly texto: string;
  readonly creadoEn: string;
}

export const esquemaContenidoAvance = z.object({ texto: z.string() });

export interface BorradorPeticion extends ContenidoPeticion {
  readonly id?: string;
  readonly categoria?: CategoriaPeticion | null;
  readonly recordatorioActivo?: boolean;
  readonly proximoRecordatorio?: string | null;
}

export const esquemaBorradorPeticion = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'oracion.errores.tituloVacio')
    .max(200, 'oracion.errores.tituloLargo'),
  detalle: z.string().trim(),
  personas: z
    .array(z.string().trim().min(1).max(120))
    .max(50, 'oracion.errores.demasiadasPersonas'),
  categoria: z.enum(CATEGORIAS_PETICION).nullable(),
});
