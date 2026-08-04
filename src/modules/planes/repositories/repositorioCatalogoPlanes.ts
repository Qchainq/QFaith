// Catálogo de planes de lectura. **Contenido público, sin cifrar.**
//
// No pasa por el motor de sincronización, por el mismo motivo que el texto
// bíblico: el motor propaga los cambios de una persona entre sus
// dispositivos, y aquí no hay cambios de nadie. Un plan es el mismo para todo
// el mundo, no se edita desde la aplicación y no tiene dueño.
//
// Este archivo **no filtra por publicado ni por contenido de pago**, y es
// deliberado: lo hace la política de la migración 0017. Repetir aquí la regla
// daría la falsa impresión de que el cliente decide, y el día que las dos
// copias se separaran ganaría la de abajo sin que nadie se enterara. Lo que sí
// se comprueba en las pruebas es que el cliente no manda esos filtros.
import type { ClienteRest } from '@shared/services/supabase/rest';

import type { DiaPlan, Plan, ReferenciaPlan } from '../models/plan';
import { esAutorPlan } from '../models/plan';

interface FilaPlan {
  readonly id: string;
  readonly creator_type: string;
  readonly title: string;
  readonly description: string | null;
  readonly language_code: string;
  readonly duration_days: number;
  readonly is_premium: boolean;
}

interface FilaDia {
  readonly id: string;
  readonly plan_id: string;
  readonly day_number: number;
  readonly title: string | null;
  readonly content: string | null;
  readonly bible_references: unknown;
  readonly reflection_questions: unknown;
}

const COL_PLAN = 'id,creator_type,title,description,language_code,duration_days,is_premium';
const COL_DIA = 'id,plan_id,day_number,title,content,bible_references,reflection_questions';

/**
 * Lee las referencias del JSON con desconfianza.
 *
 * Vienen de una columna `jsonb` que el esquema solo obliga a ser una lista;
 * su forma interior no la comprueba nadie. Una entrada mal escrita en el
 * catálogo no puede tumbar la pantalla de quien la abre, así que lo que no
 * encaja se descarta en silencio y el resto del día se enseña igual.
 */
function comoReferencias(valor: unknown): readonly ReferenciaPlan[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((entrada) => {
    if (typeof entrada !== 'object' || entrada === null) return [];
    const { libro, capitulo, versiculoInicial, versiculoFinal } = entrada as Record<
      string,
      unknown
    >;
    if (typeof libro !== 'string' || typeof capitulo !== 'number') return [];
    return [
      {
        libro,
        capitulo,
        ...(typeof versiculoInicial === 'number' ? { versiculoInicial } : {}),
        ...(typeof versiculoFinal === 'number' ? { versiculoFinal } : {}),
      },
    ];
  });
}

const comoPreguntas = (valor: unknown): readonly string[] =>
  Array.isArray(valor) ? valor.filter((p): p is string => typeof p === 'string') : [];

export function crearRepositorioCatalogoPlanes(rest: ClienteRest) {
  async function exigir<T>(
    respuesta: { estado: number; filas: readonly T[]; codigo: string | null },
    contexto: string,
  ): Promise<readonly T[]> {
    if (respuesta.estado >= 400) throw rest.comoError(respuesta, contexto);
    return respuesta.filas;
  }

  const aPlan = (fila: FilaPlan): Plan => ({
    id: fila.id,
    autor: esAutorPlan(fila.creator_type) ? fila.creator_type : 'qfaith',
    titulo: fila.title,
    descripcion: fila.description ?? '',
    idioma: fila.language_code,
    dias: fila.duration_days,
    esDePago: fila.is_premium,
  });

  /**
   * Planes disponibles.
   *
   * Se ordenan por duración porque es lo que la gente compara al elegir: «una
   * semana» frente a «un mes» dice más que un título. Nunca por popularidad:
   * no hay columna que la cuente, y no la habrá.
   */
  async function planes(idioma?: string): Promise<readonly Plan[]> {
    const filtro = idioma === undefined ? '' : `&language_code=eq.${encodeURIComponent(idioma)}`;
    const respuesta = await rest.peticion<FilaPlan>({
      metodo: 'GET',
      ruta: `/reading_plans?select=${COL_PLAN}${filtro}&order=duration_days.asc,title.asc`,
    });
    return (await exigir(respuesta, 'leer:reading_plans')).map(aPlan);
  }

  async function plan(id: string): Promise<Plan | null> {
    const respuesta = await rest.peticion<FilaPlan>({
      metodo: 'GET',
      ruta: `/reading_plans?id=eq.${encodeURIComponent(id)}&select=${COL_PLAN}`,
    });
    const fila = (await exigir(respuesta, 'leer:reading_plans'))[0];
    return fila === undefined ? null : aPlan(fila);
  }

  /** Días de un plan, en orden. */
  async function dias(planId: string): Promise<readonly DiaPlan[]> {
    const respuesta = await rest.peticion<FilaDia>({
      metodo: 'GET',
      ruta:
        `/reading_plan_days?plan_id=eq.${encodeURIComponent(planId)}` +
        `&select=${COL_DIA}&order=day_number.asc`,
    });
    return (await exigir(respuesta, 'leer:reading_plan_days')).map((fila) => ({
      id: fila.id,
      planId: fila.plan_id,
      numero: fila.day_number,
      titulo: fila.title ?? '',
      contenido: fila.content ?? '',
      referencias: comoReferencias(fila.bible_references),
      preguntas: comoPreguntas(fila.reflection_questions),
    }));
  }

  /** Varios planes de una vez, para acompañar una lista de inscripciones. */
  async function planesPorId(ids: readonly string[]): Promise<readonly Plan[]> {
    // Una lista vacía en `in.()` traería el catálogo entero.
    if (ids.length === 0) return [];
    const respuesta = await rest.peticion<FilaPlan>({
      metodo: 'GET',
      ruta: `/reading_plans?id=in.(${ids.join(',')})&select=${COL_PLAN}`,
    });
    return (await exigir(respuesta, 'leer:reading_plans')).map(aPlan);
  }

  return { planes, plan, dias, planesPorId };
}

export type RepositorioCatalogoPlanes = ReturnType<typeof crearRepositorioCatalogoPlanes>;
