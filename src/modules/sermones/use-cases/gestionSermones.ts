// Casos de uso de Sermones.
//
// La regla que sostiene el módulo: **el sermón y la nota nunca se mezclan.**
// El sermón llega del repositorio de Iglesia y va en claro; la nota va por el
// motor de sincronización y va cifrada. Una función que devolviera «el sermón
// con sus notas» en una sola estructura sería el primer paso para que alguien
// las guarde juntas.
//
// Por eso lo que se compone aquí es una vista de lectura, no un registro:
// `SermonConNotas` no se persiste en ninguna parte.
import { ErrorApp } from '@shared/errores/erroresApp';
import type { FilaSermon, RepositorioIglesia } from '@shared/services/supabase/repositorioIglesia';

import {
  esquemaBorradorAccion,
  esquemaBorradorNota,
  ESTADOS_PUBLICACION,
  type AccionSermon,
  type BorradorAccion,
  type BorradorNota,
  type EstadoPublicacion,
  type NotaSermon,
  type Sermon,
} from '../models/sermon';
import type { LecturaNotas, RepositorioSermones } from '../repositories/repositorioNotasSermon';

function errorValidacion(claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo: 'SERMON_INVALIDO',
    categoria: 'validacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

const esEstado = (valor: string): valor is EstadoPublicacion =>
  (ESTADOS_PUBLICACION as readonly string[]).includes(valor);

/** Las referencias bíblicas llegan como JSON libre; se aceptan solo cadenas. */
function aReferencias(valor: unknown): readonly string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((entrada): entrada is string => typeof entrada === 'string');
}

export function aSermon(fila: FilaSermon): Sermon {
  return {
    id: fila.id,
    iglesiaId: fila.church_id,
    titulo: fila.title,
    predicador: fila.speaker_name,
    fecha: fila.sermon_date,
    resumen: fila.public_summary,
    referencias: aReferencias(fila.bible_references),
    audio: fila.audio_path,
    video: fila.video_url,
    estado: esEstado(fila.publication_status) ? fila.publication_status : 'draft',
  };
}

export async function sermonesDe(
  repositorio: RepositorioIglesia,
  iglesiaId: string,
): Promise<readonly Sermon[]> {
  return (await repositorio.sermones(iglesiaId)).map(aSermon);
}

export async function listarNotas(repositorio: RepositorioSermones): Promise<LecturaNotas> {
  return repositorio.listarNotas();
}

export async function guardarNota(
  repositorio: RepositorioSermones,
  borrador: BorradorNota,
): Promise<NotaSermon> {
  const destacados = [
    ...new Set(borrador.destacados.map((entrada) => entrada.trim()).filter((e) => e.length > 0)),
  ];

  const validado = esquemaBorradorNota.safeParse({ texto: borrador.texto, destacados });
  if (!validado.success) {
    throw errorValidacion(validado.error.issues[0]?.message ?? 'errores.validacion');
  }

  return repositorio.guardarNota({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...validado.data,
    ...(borrador.sermonId === undefined ? {} : { sermonId: borrador.sermonId }),
  });
}

export async function eliminarNota(repositorio: RepositorioSermones, id: string): Promise<void> {
  // Lógico: papelera de 30 días (invariante 6).
  await repositorio.eliminarNota(id);
}

export async function listarAcciones(
  repositorio: RepositorioSermones,
): Promise<readonly AccionSermon[]> {
  return repositorio.listarAcciones();
}

export async function guardarAccion(
  repositorio: RepositorioSermones,
  borrador: BorradorAccion,
): Promise<AccionSermon> {
  const validado = esquemaBorradorAccion.safeParse({
    texto: borrador.texto,
    fechaLimite: borrador.fechaLimite ?? null,
  });
  if (!validado.success) {
    throw errorValidacion(validado.error.issues[0]?.message ?? 'errores.validacion');
  }

  return repositorio.guardarAccion({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...(borrador.notaId === undefined ? {} : { notaId: borrador.notaId }),
    texto: validado.data.texto,
    fechaLimite: validado.data.fechaLimite,
    ...(borrador.recordatorio === undefined ? {} : { recordatorio: borrador.recordatorio }),
  });
}

/**
 * Marca o desmarca una acción.
 *
 * Se puede desmarcar a propósito: proponerse algo, darlo por hecho y darse
 * cuenta de que no lo estaba es normal. Un estado que solo avanza convierte
 * un propósito en una deuda (invariante 12).
 */
export async function alternarHecha(
  repositorio: RepositorioSermones,
  id: string,
  ahora: () => string = () => new Date().toISOString(),
): Promise<AccionSermon | null> {
  return repositorio.alternarHecha(id, ahora());
}

export interface SermonConNotas {
  readonly sermon: Sermon;
  readonly notas: readonly NotaSermon[];
}

/**
 * Compone sermones con las notas propias sobre cada uno.
 *
 * **Es una vista, no un registro.** Nada de esto se persiste junto: el sermón
 * vive en `sermons` y las notas en `sermon_notes`, con políticas distintas.
 */
export function componer(
  sermones: readonly Sermon[],
  notas: readonly NotaSermon[],
): readonly SermonConNotas[] {
  return sermones.map((sermon) => ({
    sermon,
    notas: notas.filter((nota) => nota.sermonId === sermon.id),
  }));
}

/** Notas que no cuelgan de ningún sermón: apuntes sueltos, igual de válidos. */
export function sueltas(notas: readonly NotaSermon[]): readonly NotaSermon[] {
  return notas.filter((nota) => nota.sermonId === null);
}
