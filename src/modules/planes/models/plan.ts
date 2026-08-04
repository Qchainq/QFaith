// Modelo de los planes de lectura.
//
// El módulo está partido en dos mitades que conviene no mezclar:
//
//   · **El plan** es catálogo. Lo escribe QFaith o una iglesia, no es de
//     nadie, no se cifra y no se sincroniza.
//
//   · **El seguimiento** es de la persona. Por dónde va, qué días completó y
//     qué escribió al reflexionar. Se cifra y viaja por el motor.
//
// La regla que gobierna todo lo demás está en `siguienteDia`: **un plan avanza
// cuando alguien lo lee, nunca cuando pasa el tiempo.** Si empiezas un plan de
// treinta días y lo dejas el tercero, un mes después sigues en el tercero.
// El plan te espera. Contar días de calendario convertiría un acompañamiento
// en una deuda, y eso es exactamente lo que el invariante 12 prohíbe.
import { z } from 'zod';

/** Quién escribió el plan. */
export const AUTORES_PLAN = ['qfaith', 'church', 'user'] as const;
export type AutorPlan = (typeof AUTORES_PLAN)[number];

/**
 * Estados de una inscripción.
 *
 * `abandonado` no es un fracaso y el vocabulario lo dice: es una decisión
 * legítima, y volver a empezar el mismo plan más tarde está permitido.
 */
export const ESTADOS_INSCRIPCION = ['active', 'paused', 'completed', 'abandoned'] as const;
export type EstadoInscripcion = (typeof ESTADOS_INSCRIPCION)[number];

/** Una referencia bíblica de un día del plan. */
export interface ReferenciaPlan {
  readonly libro: string;
  readonly capitulo: number;
  readonly versiculoInicial?: number;
  readonly versiculoFinal?: number;
}

/** Ficha de catálogo. Contenido público. */
export interface Plan {
  readonly id: string;
  readonly autor: AutorPlan;
  readonly titulo: string;
  readonly descripcion: string;
  readonly idioma: string;
  readonly dias: number;
  readonly esDePago: boolean;
}

/** Un día del plan. Contenido público. */
export interface DiaPlan {
  readonly id: string;
  readonly planId: string;
  readonly numero: number;
  readonly titulo: string;
  readonly contenido: string;
  readonly referencias: readonly ReferenciaPlan[];
  readonly preguntas: readonly string[];
}

/** El recorrido de una persona por un plan. */
export interface Inscripcion {
  readonly id: string;
  readonly planId: string;
  readonly diaActual: number;
  readonly estado: EstadoInscripcion;
  readonly empezadoEn: string;
  readonly completadoEn: string | null;
}

/** Un día concreto para una persona. */
export interface DiaCompletado {
  readonly inscripcionId: string;
  readonly numero: number;
  readonly completadoEn: string | null;
  readonly reflexion: string;
}

/** Lo único cifrado del módulo. */
export const esquemaContenidoProgreso = z.object({
  reflexion: z.string().default(''),
});

export const esAutorPlan = (valor: unknown): valor is AutorPlan =>
  typeof valor === 'string' && (AUTORES_PLAN as readonly string[]).includes(valor);

export const esEstadoInscripcion = (valor: unknown): valor is EstadoInscripcion =>
  typeof valor === 'string' && (ESTADOS_INSCRIPCION as readonly string[]).includes(valor);

/**
 * A qué día pasa la inscripción tras completar uno.
 *
 * Tres cosas que hace y una que no:
 *
 *   · Avanza solo si se completó el día en el que se estaba. Marcar un día
 *     anterior —porque alguien vuelve a leerlo o rellena un hueco— no empuja
 *     el plan hacia delante.
 *   · No pasa del último día: ahí el plan está terminado, no en el día 31 de
 *     30.
 *   · **No mira el calendario en ningún caso.** Es lo que hace que dejar un
 *     plan y volver semanas después no cueste nada.
 */
export function siguienteDia(parametros: {
  readonly diaActual: number;
  readonly diaCompletado: number;
  readonly totalDias: number;
}): number {
  if (parametros.diaCompletado !== parametros.diaActual) return parametros.diaActual;
  return Math.min(parametros.diaActual + 1, parametros.totalDias);
}

/** ¿Completar este día termina el plan? */
export const terminaElPlan = (parametros: {
  readonly diaCompletado: number;
  readonly totalDias: number;
}): boolean => parametros.diaCompletado >= parametros.totalDias;

/**
 * Cuántos días de este plan ha leído la persona.
 *
 * Es un recuento, no un porcentaje de cumplimiento ni una racha: dice cuánto
 * ha recorrido, nunca cuánto ha fallado. La diferencia no es de redacción —un
 * porcentaje invita a compararse con el ideal, y un recuento no.
 */
export const diasLeidos = (dias: readonly DiaCompletado[]): number =>
  dias.filter((dia) => dia.completadoEn !== null).length;

/** Texto de posición, siempre en positivo. Devuelve claves de i18n. */
export function posicionEnPlan(inscripcion: Inscripcion, totalDias: number) {
  return inscripcion.estado === 'completed'
    ? { clave: 'planes.posicion.completado' as const, valores: { total: totalDias } }
    : {
        clave: 'planes.posicion.enCurso' as const,
        valores: { dia: inscripcion.diaActual, total: totalDias },
      };
}
