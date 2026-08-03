// Casos de uso del Memorial.
//
// La regla que no es evidente vive aquí: **un memorial que nace de una
// oración respondida se rellena con lo que la persona ya escribió**, para que
// no tenga que contar dos veces lo mismo. Pero es una copia, no un vínculo de
// contenido: a partir de ese momento el memorial es suyo y editar la petición
// no lo reescribe. El recuerdo de cómo se vivió algo no debería cambiar
// porque alguien retoque después el texto de lo que pidió.
import { ErrorApp } from '@shared/errores/erroresApp';

import type { Peticion } from '@modules/oracion/models/peticion';

import {
  anoDe,
  esquemaBorradorMemorial,
  type BorradorMemorial,
  type Memorial,
} from '../models/memorial';
import type { LecturaMemoriales, RepositorioMemorial } from '../repositories/repositorioMemorial';

function errorValidacion(claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo: 'MEMORIAL_INVALIDO',
    categoria: 'validacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

export async function listarMemoriales(
  repositorio: RepositorioMemorial,
): Promise<LecturaMemoriales> {
  return repositorio.listar();
}

export async function guardarMemorial(
  repositorio: RepositorioMemorial,
  borrador: BorradorMemorial,
): Promise<Memorial> {
  const personas = [
    ...new Set(borrador.personas.map((persona) => persona.trim()).filter((p) => p.length > 0)),
  ];

  const validado = esquemaBorradorMemorial.safeParse({
    titulo: borrador.titulo,
    relato: borrador.relato,
    personas,
    ocurrioEl: borrador.ocurrioEl ?? null,
  });

  if (!validado.success) {
    throw errorValidacion(validado.error.issues[0]?.message ?? 'errores.validacion');
  }

  return repositorio.guardar({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...validado.data,
    ...(borrador.peticionId === undefined ? {} : { peticionId: borrador.peticionId }),
    ...(borrador.favorito === undefined ? {} : { favorito: borrador.favorito }),
  });
}

export async function alternarFavorito(
  repositorio: RepositorioMemorial,
  id: string,
): Promise<Memorial | null> {
  return repositorio.alternarFavorito(id);
}

export async function eliminarMemorial(
  repositorio: RepositorioMemorial,
  id: string,
): Promise<void> {
  // Lógico: espera 30 días en la papelera. Es contenido que alguien puede
  // retirar en un mal día y querer de vuelta al siguiente (invariante 6).
  await repositorio.eliminar(id);
}

/**
 * Borrador a partir de una oración respondida.
 *
 * Se copia lo que ya escribió, no se enlaza. Ver la nota de cabecera.
 * `relato` queda vacío a propósito: lo que falta contar es qué pasó, y
 * rellenarlo con el detalle de la petición pondría en boca de la persona algo
 * que no dijo.
 */
export function borradorDesdePeticion(peticion: Peticion): BorradorMemorial {
  return {
    peticionId: peticion.id,
    titulo: peticion.titulo,
    relato: '',
    personas: peticion.personas,
    ocurrioEl: peticion.respondidaEn === null ? null : peticion.respondidaEn.slice(0, 10),
  };
}

export interface TramoCronologia {
  /** Año, o `null` para los memoriales sin fecha. */
  readonly ano: string | null;
  readonly memoriales: readonly Memorial[];
}

/**
 * Agrupa la cronología por año.
 *
 * El tramo sin fecha va al final y aparte: colar esos memoriales en el año en
 * curso sería inventarle un recuerdo a alguien.
 */
export function porAno(memoriales: readonly Memorial[]): readonly TramoCronologia[] {
  const tramos = new Map<string, Memorial[]>();
  const sinFecha: Memorial[] = [];

  for (const memorial of memoriales) {
    const ano = anoDe(memorial);
    if (ano === null) {
      sinFecha.push(memorial);
      continue;
    }
    const tramo = tramos.get(ano);
    if (tramo === undefined) tramos.set(ano, [memorial]);
    else tramo.push(memorial);
  }

  const ordenados: TramoCronologia[] = [...tramos.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([ano, lista]) => ({ ano, memoriales: lista }));

  return sinFecha.length === 0 ? ordenados : [...ordenados, { ano: null, memoriales: sinFecha }];
}

/** Filtra por favoritos. Sin filtro devuelve todo, en su orden cronológico. */
export function soloFavoritos(
  memoriales: readonly Memorial[],
  activo: boolean,
): readonly Memorial[] {
  return activo ? memoriales.filter((memorial) => memorial.favorito) : memoriales;
}
