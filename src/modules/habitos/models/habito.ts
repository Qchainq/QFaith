// Modelo de Hábitos (Documento 11, módulo 4).
//
// Una regla del proyecto pesa sobre todo este módulo: **nada de rachas
// punitivas** (invariante 12). No hay «llevas 3 días sin», no se cuentan
// fallos y no existe el concepto de racha rota. Lo único que se registra es
// lo que la persona sí hizo.
import { z } from 'zod';

/** Coincide con el enum `habit_frequency` del esquema. */
export const FRECUENCIAS = ['daily', 'weekly', 'monthly', 'custom'] as const;
export type Frecuencia = (typeof FRECUENCIAS)[number];

/** Categorías generales, nunca texto de la persona. */
export const CATEGORIAS_HABITO = [
  'oracion',
  'lectura',
  'gratitud',
  'servicio',
  'ayuno',
  'comunidad',
  'descanso',
  'otro',
] as const;
export type CategoriaHabito = (typeof CATEGORIAS_HABITO)[number];

/**
 * Lo que viaja cifrado.
 *
 * El título de un hábito puede ser «dejar de beber» o «volver a hablar con mi
 * padre». No es un dato neutro por mucho que parezca una lista de tareas.
 */
export const esquemaContenidoHabito = z.object({
  titulo: z.string().max(200),
  descripcion: z.string(),
});
export type ContenidoHabito = z.infer<typeof esquemaContenidoHabito>;

/** Días de la semana en los que toca. 1 es lunes, 7 domingo (ISO 8601). */
export const esquemaConfiguracion = z.object({
  dias: z.array(z.number().int().min(1).max(7)).max(7),
});
export type ConfiguracionRepeticion = z.infer<typeof esquemaConfiguracion>;

export interface Habito extends ContenidoHabito {
  readonly id: string;
  readonly categoria: CategoriaHabito | null;
  readonly frecuencia: Frecuencia;
  readonly configuracion: ConfiguracionRepeticion;
  readonly fechaInicio: string;
  readonly fechaFin: string | null;
  readonly recordatorioActivo: boolean;
  readonly horaRecordatorio: string | null;
  readonly activo: boolean;
  readonly creadoEn: string;
  readonly actualizadoEn: string;
}

/** Un día cumplido. No existe registro para un día no cumplido. */
export interface RegistroHabito {
  readonly id: string;
  readonly habitoId: string;
  readonly fecha: string;
  readonly nota: string;
}

export const esquemaContenidoRegistro = z.object({ nota: z.string() });

export interface BorradorHabito extends ContenidoHabito {
  readonly id?: string;
  readonly categoria?: CategoriaHabito | null;
  readonly frecuencia?: Frecuencia;
  readonly configuracion?: ConfiguracionRepeticion;
  readonly fechaInicio?: string;
  readonly activo?: boolean;
}

export const esquemaBorradorHabito = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, 'habitos.errores.tituloVacio')
    .max(200, 'habitos.errores.tituloLargo'),
  descripcion: z.string().trim(),
  categoria: z.enum(CATEGORIAS_HABITO).nullable(),
  frecuencia: z.enum(FRECUENCIAS),
  configuracion: esquemaConfiguracion,
  fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'habitos.errores.fechaInvalida'),
});

/** Día de hoy en el calendario del dispositivo, no en UTC. */
export function fechaDeHoy(ahora: Date = new Date()): string {
  const con2 = (valor: number): string => String(valor).padStart(2, '0');
  return `${ahora.getFullYear()}-${con2(ahora.getMonth() + 1)}-${con2(ahora.getDate())}`;
}

/**
 * Cuántos días de los últimos `ventana` se cumplieron.
 *
 * Se cuenta lo hecho, nunca lo no hecho: la diferencia no es cosmética. Un
 * «7 de los últimos 30» acompaña; un «llevas 23 días sin» culpabiliza, y el
 * Documento 13 lo prohíbe expresamente.
 */
export function cumplidosRecientes(fechas: readonly string[], hoy: string, ventana = 30): number {
  const limite = new Date(`${hoy}T00:00:00.000Z`);
  limite.setUTCDate(limite.getUTCDate() - (ventana - 1));
  const desde = limite.toISOString().slice(0, 10);
  return fechas.filter((fecha) => fecha >= desde && fecha <= hoy).length;
}
