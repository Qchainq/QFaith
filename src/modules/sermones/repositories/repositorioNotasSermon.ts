// Notas y acciones de sermón.
//
// Van por el motor de sincronización como el resto del contenido cifrado del
// usuario. El sermón en sí no: es institucional, va en claro y lo trae el
// repositorio de Iglesia. Que estén separados no es casualidad — es lo que
// hace imposible que una nota acabe compartiendo política con un sermón.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  esquemaContenidoAccion,
  esquemaContenidoNota,
  type AccionSermon,
  type BorradorAccion,
  type BorradorNota,
  type NotaSermon,
} from '../models/sermon';

export const TIPO_NOTA = 'sermon_notes';
export const TIPO_ACCION = 'sermon_actions';

export interface DependenciasRepositorioSermones {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveSermon: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

export interface LecturaNotas {
  readonly notas: readonly NotaSermon[];
  readonly ilegibles: number;
}

const textoONulo = (valor: unknown): string | null => (typeof valor === 'string' ? valor : null);

export function crearRepositorioSermones(dependencias: DependenciasRepositorioSermones) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (tipoEntidad: string, entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad,
    entidadId,
  });

  function abrir(registro: RegistroLocal): unknown | null {
    try {
      return JSON.parse(
        descifrar({
          sobre: registro.sobre,
          clave: dependencias.claveSermon(),
          vinculo: vinculo(registro.tipoEntidad, registro.id),
        }),
      );
    } catch {
      // Sin identificador ni motivo: diría cuántas notas tiene alguien y de
      // qué sermones (invariante 2).
      return null;
    }
  }

  const sobreDe = (contenido: unknown, tipoEntidad: string, id: string) =>
    cifrar({
      contenido: JSON.stringify(contenido),
      clave: dependencias.claveSermon(),
      claveHash: dependencias.claveHash(),
      vinculo: vinculo(tipoEntidad, id),
    });

  function aNota(registro: RegistroLocal): NotaSermon | null {
    const contenido = esquemaContenidoNota.safeParse(abrir(registro));
    if (!contenido.success) return null;

    return {
      id: registro.id,
      ...contenido.data,
      sermonId: textoONulo(registro.metadatos.sermon_id),
      creadaEn: registro.creadoEn,
      actualizadaEn: registro.actualizadoEn,
    };
  }

  function aAccion(registro: RegistroLocal): AccionSermon | null {
    const contenido = esquemaContenidoAccion.safeParse(abrir(registro));
    if (!contenido.success) return null;

    return {
      id: registro.id,
      notaId: textoONulo(registro.metadatos.sermon_note_id),
      texto: contenido.data.texto,
      fechaLimite: textoONulo(registro.metadatos.due_date),
      completadaEn: textoONulo(registro.metadatos.completed_at),
      recordatorio: registro.metadatos.reminder_enabled === true,
    };
  }

  async function listarNotas(): Promise<LecturaNotas> {
    const registros = await almacen.listar(TIPO_NOTA);
    const notas: NotaSermon[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const nota = aNota(registro);
      if (nota === null) ilegibles += 1;
      else notas.push(nota);
    }

    notas.sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
    return { notas, ilegibles };
  }

  async function obtenerNota(id: string): Promise<NotaSermon | null> {
    const registro = await obtenerVigente(almacen, TIPO_NOTA, id);
    return registro === null ? null : aNota(registro);
  }

  async function guardarNota(borrador: BorradorNota): Promise<NotaSermon> {
    const id = borrador.id ?? generarUuid();
    const existente = borrador.id === undefined ? null : await obtenerNota(borrador.id);

    const contenido = esquemaContenidoNota.parse({
      texto: borrador.texto,
      destacados: borrador.destacados,
    });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_NOTA,
      sobre: sobreDe(contenido, TIPO_NOTA, id),
      metadatos: {
        // El sermón de origen no se pierde al editar el texto.
        sermon_id: borrador.sermonId ?? existente?.sermonId ?? null,
      },
    });

    const guardada = aNota(registro);
    if (guardada === null) throw new Error('La nota recién guardada no se puede releer');
    return guardada;
  }

  async function eliminarNota(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_NOTA, id);
  }

  async function listarAcciones(): Promise<readonly AccionSermon[]> {
    const registros = await almacen.listar(TIPO_ACCION);
    return registros.map(aAccion).filter((accion): accion is AccionSermon => accion !== null);
  }

  async function guardarAccion(borrador: BorradorAccion): Promise<AccionSermon> {
    const id = borrador.id ?? generarUuid();
    const registroPrevio =
      borrador.id === undefined ? null : await obtenerVigente(almacen, TIPO_ACCION, id);
    const existente = registroPrevio === null ? null : aAccion(registroPrevio);

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_ACCION,
      sobre: sobreDe(esquemaContenidoAccion.parse({ texto: borrador.texto }), TIPO_ACCION, id),
      metadatos: {
        sermon_note_id: borrador.notaId ?? existente?.notaId ?? null,
        due_date: borrador.fechaLimite ?? existente?.fechaLimite ?? null,
        // Editar el texto no marca ni desmarca: para eso está `alternarHecha`.
        completed_at: existente?.completadaEn ?? null,
        reminder_enabled: borrador.recordatorio ?? existente?.recordatorio ?? false,
      },
    });

    const guardada = aAccion(registro);
    if (guardada === null) throw new Error('La acción recién guardada no se puede releer');
    return guardada;
  }

  /** Marca o desmarca una acción sin volver a cifrar su texto. */
  async function alternarHecha(id: string, ahora: string): Promise<AccionSermon | null> {
    const registro = await obtenerVigente(almacen, TIPO_ACCION, id);
    const actual = registro === null ? null : aAccion(registro);
    if (registro === null || actual === null) return null;

    const actualizado = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_ACCION,
      sobre: registro.sobre,
      metadatos: {
        sermon_note_id: actual.notaId,
        due_date: actual.fechaLimite,
        completed_at: actual.completadaEn === null ? ahora : null,
        reminder_enabled: actual.recordatorio,
      },
    });

    return aAccion(actualizado);
  }

  async function eliminarAccion(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_ACCION, id);
  }

  return {
    listarNotas,
    obtenerNota,
    guardarNota,
    eliminarNota,
    listarAcciones,
    guardarAccion,
    alternarHecha,
    eliminarAccion,
  };
}

export type RepositorioSermones = ReturnType<typeof crearRepositorioSermones>;
