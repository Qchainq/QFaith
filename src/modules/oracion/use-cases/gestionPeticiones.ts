// Casos de uso de Oración.
//
// Además de validar, aquí vive una regla que no es evidente: marcar una
// petición como respondida **no la borra ni la esconde**. Es una decisión de
// producto del Documento 12, y ponerla en la pantalla la dejaría a merced de
// que alguien la reimplemente distinto en otro sitio.
import { ErrorApp } from '@shared/errores/erroresApp';

import {
  esquemaBorradorPeticion,
  type AvancePeticion,
  type BorradorPeticion,
  type Peticion,
} from '../models/peticion';
import type { LecturaPeticiones, RepositorioOracion } from '../repositories/repositorioOracion';

function errorValidacion(claveMensaje: string): ErrorApp {
  return new ErrorApp({
    codigo: 'PETICION_INVALIDA',
    categoria: 'validacion',
    claveMensaje,
    puedeReintentarse: false,
  });
}

export async function listarPeticiones(
  repositorio: RepositorioOracion,
): Promise<LecturaPeticiones> {
  return repositorio.listar();
}

export async function guardarPeticion(
  repositorio: RepositorioOracion,
  borrador: BorradorPeticion,
): Promise<Peticion> {
  // Los nombres se normalizan igual que las etiquetas del diario: viajan
  // cifrados, así que nadie puede limpiarlos después desde el servidor.
  const personas = [
    ...new Set(borrador.personas.map((persona) => persona.trim()).filter((p) => p.length > 0)),
  ];

  const validado = esquemaBorradorPeticion.safeParse({
    titulo: borrador.titulo,
    detalle: borrador.detalle,
    personas,
    categoria: borrador.categoria ?? null,
  });

  if (!validado.success) {
    throw errorValidacion(validado.error.issues[0]?.message ?? 'errores.validacion');
  }

  return repositorio.guardar({
    ...(borrador.id === undefined ? {} : { id: borrador.id }),
    ...validado.data,
    ...(borrador.recordatorioActivo === undefined
      ? {}
      : { recordatorioActivo: borrador.recordatorioActivo }),
    ...(borrador.proximoRecordatorio === undefined
      ? {}
      : { proximoRecordatorio: borrador.proximoRecordatorio }),
  });
}

/**
 * Marca una petición como respondida.
 *
 * La petición se conserva entera, con su fecha. Es lo que después permite el
 * memorial: sin el recorrido, una respuesta es solo un dato suelto.
 */
export async function marcarRespondida(
  repositorio: RepositorioOracion,
  id: string,
): Promise<Peticion | null> {
  return repositorio.cambiarEstado(id, 'answered');
}

/** Archiva sin borrar: sale de la lista activa y se puede recuperar. */
export async function archivarPeticion(
  repositorio: RepositorioOracion,
  id: string,
): Promise<Peticion | null> {
  return repositorio.cambiarEstado(id, 'archived');
}

/** Devuelve una petición archivada o respondida a la vida activa. */
export async function reactivarPeticion(
  repositorio: RepositorioOracion,
  id: string,
): Promise<Peticion | null> {
  return repositorio.cambiarEstado(id, 'active');
}

export async function eliminarPeticion(repositorio: RepositorioOracion, id: string): Promise<void> {
  await repositorio.eliminar(id);
}

export async function anotarAvance(
  repositorio: RepositorioOracion,
  parametros: { readonly peticionId: string; readonly texto: string },
): Promise<AvancePeticion> {
  const texto = parametros.texto.trim();
  if (texto.length === 0) {
    throw errorValidacion('oracion.errores.avanceVacio');
  }
  return repositorio.anotarAvance(parametros.peticionId, texto);
}

export async function listarAvances(
  repositorio: RepositorioOracion,
  peticionId: string,
): Promise<readonly AvancePeticion[]> {
  return repositorio.listarAvances(peticionId);
}
