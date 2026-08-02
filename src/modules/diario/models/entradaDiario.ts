// Modelo del Diario Espiritual (Documento 11, módulo 5).
//
// La separación importa más que en otros módulos: lo que va **dentro** del
// sobre cifrado es lo que el servidor no puede ver nunca, y lo que queda
// fuera es lo mínimo para poder ordenar y filtrar sin descifrar. Añadir un
// campo al lado equivocado es una fuga, no un detalle de diseño.
import { z } from 'zod';

/** Tipos del Documento 11. Coinciden con el enum `journal_type` del esquema. */
export const TIPOS_ENTRADA = [
  'reflection',
  'testimony',
  'learning',
  'dream',
  'gratitude',
  'private_confession',
  'general',
] as const;

export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

/**
 * Lo que viaja cifrado.
 *
 * Las etiquetas van aquí a propósito: «ansiedad», «duda», «matrimonio» dicen
 * tanto del estado de una persona como el propio texto.
 */
export const esquemaContenidoPrivado = z.object({
  titulo: z.string().max(200),
  cuerpo: z.string(),
  etiquetas: z.array(z.string().max(60)).max(20),
});

export type ContenidoPrivado = z.infer<typeof esquemaContenidoPrivado>;

/** Entrada tal y como la maneja la aplicación, ya descifrada. */
export interface EntradaDiario extends ContenidoPrivado {
  readonly id: string;
  readonly tipo: TipoEntrada;
  /**
   * Día del calendario **del usuario**, no un instante UTC. Una entrada
   * escrita a las 23:50 pertenece a ese día aunque en UTC ya sea el
   * siguiente; convertirla desplazaría el diario de quien vive al este o al
   * oeste de Greenwich. Las marcas de creación y modificación sí son UTC.
   */
  readonly fecha: string;
  readonly esFavorita: boolean;
  /** Modo Arca: el cliente exige autenticación adicional para abrirla. */
  readonly protegidaConArca: boolean;
  readonly creadaEn: string;
  readonly actualizadaEn: string;
}

/** Datos que la pantalla entrega para crear o modificar una entrada. */
export interface BorradorEntrada extends ContenidoPrivado {
  /** Ausente al crear; presente al editar. */
  readonly id?: string;
  readonly tipo: TipoEntrada;
  readonly fecha: string;
  readonly esFavorita?: boolean;
  readonly protegidaConArca?: boolean;
}

/** Formato de fecha que acepta la columna `entry_date`. */
export const esquemaFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'diario.errores.fechaInvalida');

export const esquemaBorrador = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'diario.errores.tituloVacio')
    .max(200, 'diario.errores.tituloLargo'),
  cuerpo: z.string().trim().min(1, 'diario.errores.cuerpoVacio'),
  etiquetas: z
    .array(z.string().trim().min(1).max(60))
    .max(20, 'diario.errores.demasiadasEtiquetas'),
  tipo: z.enum(TIPOS_ENTRADA),
  fecha: esquemaFecha,
});

/** Día de hoy en el calendario del dispositivo, no en UTC. */
export function fechaDeHoy(ahora: Date = new Date()): string {
  const con2 = (valor: number): string => String(valor).padStart(2, '0');
  return `${ahora.getFullYear()}-${con2(ahora.getMonth() + 1)}-${con2(ahora.getDate())}`;
}
