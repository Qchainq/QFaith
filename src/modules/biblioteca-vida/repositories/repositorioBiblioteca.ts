// Repositorio de la Biblioteca de Vida.
//
// Guarda referencias clasificadas, no copias. El identificador del elemento
// se deriva del origen para que reclasificar actualice la ficha existente en
// lugar de crear otra: el esquema tiene una restricción única por
// (usuario, tipo de origen, origen) y dos dispositivos chocarían con ella.
import type { AlmacenLocal, Metadatos, RegistroLocal } from '@shared/database/tipos';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  esquemaContenidoElemento,
  ORIGENES,
  type ContenidoElemento,
  type ElementoBiblioteca,
  type Origen,
} from '../models/biblioteca';

export const TIPO_ELEMENTO = 'life_library_items';

export interface DependenciasRepositorioBiblioteca {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveBiblioteca: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

export interface LecturaBiblioteca {
  readonly elementos: readonly ElementoBiblioteca[];
  readonly ilegibles: number;
}

const esOrigen = (valor: unknown): valor is Origen =>
  typeof valor === 'string' && (ORIGENES as readonly string[]).includes(valor);

export function crearRepositorioBiblioteca(dependencias: DependenciasRepositorioBiblioteca) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_ELEMENTO,
    entidadId,
  });

  function aElemento(registro: RegistroLocal): ElementoBiblioteca | null {
    let contenido: ContenidoElemento;
    try {
      contenido = esquemaContenidoElemento.parse(
        JSON.parse(
          descifrar({
            sobre: registro.sobre,
            clave: dependencias.claveBiblioteca(),
            vinculo: vinculo(registro.id),
          }),
        ),
      );
    } catch {
      return null;
    }

    const origen = registro.metadatos.source_type;
    const origenId = registro.metadatos.source_id;
    if (!esOrigen(origen) || typeof origenId !== 'string') {
      return null;
    }

    return {
      id: registro.id,
      ...contenido,
      origen,
      origenId,
      ocurridoEn:
        typeof registro.metadatos.occurred_at === 'string' ? registro.metadatos.occurred_at : null,
      esFavorito: registro.metadatos.is_favorite === true,
      actualizadoEn: registro.actualizadoEn,
    };
  }

  function metadatosDe(parametros: {
    readonly origen: Origen;
    readonly origenId: string;
    readonly ocurridoEn: string | null;
    readonly esFavorito: boolean;
  }): Metadatos {
    return {
      source_type: parametros.origen,
      source_id: parametros.origenId,
      occurred_at: parametros.ocurridoEn,
      is_favorite: parametros.esFavorito,
    };
  }

  async function listar(): Promise<LecturaBiblioteca> {
    const registros = await almacen.listar(TIPO_ELEMENTO);
    const elementos: ElementoBiblioteca[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const elemento = aElemento(registro);
      if (elemento === null) ilegibles += 1;
      else elementos.push(elemento);
    }

    // Cronología descendente: la Biblioteca es un recorrido, no un archivo.
    elementos.sort((a, b) =>
      (b.ocurridoEn ?? b.actualizadoEn).localeCompare(a.ocurridoEn ?? a.actualizadoEn),
    );

    return { elementos, ilegibles };
  }

  /**
   * Crea o actualiza la ficha de un registro de origen.
   *
   * El identificador viene de quien llama y es estable para el mismo origen,
   * porque reclasificar tiene que actualizar la ficha, no duplicarla.
   */
  async function registrar(parametros: {
    readonly id: string;
    readonly origen: Origen;
    readonly origenId: string;
    readonly contenido: ContenidoElemento;
    readonly ocurridoEn: string | null;
    readonly esFavorito?: boolean;
  }): Promise<ElementoBiblioteca> {
    const contenido = esquemaContenidoElemento.parse(parametros.contenido);

    const registro = await motor.registrarCambioLocal({
      id: parametros.id,
      tipoEntidad: TIPO_ELEMENTO,
      sobre: cifrar({
        contenido: JSON.stringify(contenido),
        clave: dependencias.claveBiblioteca(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(parametros.id),
      }),
      metadatos: metadatosDe({
        origen: parametros.origen,
        origenId: parametros.origenId,
        ocurridoEn: parametros.ocurridoEn,
        esFavorito: parametros.esFavorito ?? false,
      }),
    });

    const guardado = aElemento(registro);
    if (guardado === null) {
      throw new Error('El elemento recién guardado no se puede releer');
    }
    return guardado;
  }

  /** Retira la ficha cuyo registro de origen ya no existe. */
  async function retirar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_ELEMENTO, id);
  }

  return { listar, registrar, retirar };
}

export type RepositorioBiblioteca = ReturnType<typeof crearRepositorioBiblioteca>;
