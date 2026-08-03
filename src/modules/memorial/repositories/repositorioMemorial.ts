// Repositorio del Memorial.
//
// Mismo patrón que Oración y Diario. Lo propio de este módulo es que el
// memorial **sobrevive a la petición de la que nació**: si alguien borra la
// oración, el recuerdo de la respuesta sigue en pie. Por eso `peticionId` es
// una referencia suelta y nada aquí la da por buena.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import { esquemaContenidoMemorial, type BorradorMemorial, type Memorial } from '../models/memorial';

export const TIPO_MEMORIAL = 'memorials';

export interface DependenciasRepositorioMemorial {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveMemorial: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

export interface LecturaMemoriales {
  readonly memoriales: readonly Memorial[];
  readonly ilegibles: number;
}

const textoONulo = (valor: unknown): string | null => (typeof valor === 'string' ? valor : null);

export function crearRepositorioMemorial(dependencias: DependenciasRepositorioMemorial) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_MEMORIAL,
    entidadId,
  });

  function aMemorial(registro: RegistroLocal): Memorial | null {
    let bruto: unknown;
    try {
      bruto = JSON.parse(
        descifrar({
          sobre: registro.sobre,
          clave: dependencias.claveMemorial(),
          vinculo: vinculo(registro.id),
        }),
      );
    } catch {
      // Sin identificador ni motivo en el registro: diría cuántos memoriales
      // tiene alguien y de cuándo son (invariante 2).
      return null;
    }

    const contenido = esquemaContenidoMemorial.safeParse(bruto);
    if (!contenido.success) return null;

    return {
      id: registro.id,
      ...contenido.data,
      peticionId: textoONulo(registro.metadatos.prayer_id),
      ocurrioEl: textoONulo(registro.metadatos.occurred_on),
      favorito: registro.metadatos.is_favorite === true,
      creadoEn: registro.creadoEn,
      actualizadoEn: registro.actualizadoEn,
    };
  }

  async function listar(): Promise<LecturaMemoriales> {
    const registros = await almacen.listar(TIPO_MEMORIAL);
    const memoriales: Memorial[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const memorial = aMemorial(registro);
      if (memorial === null) ilegibles += 1;
      else memoriales.push(memorial);
    }

    // Cronología descendente. Los que no tienen fecha van al final: no se
    // les inventa un día para poder ordenarlos.
    memoriales.sort((a, b) => {
      if (a.ocurrioEl === null && b.ocurrioEl === null) {
        return b.creadoEn.localeCompare(a.creadoEn);
      }
      if (a.ocurrioEl === null) return 1;
      if (b.ocurrioEl === null) return -1;
      return b.ocurrioEl.localeCompare(a.ocurrioEl);
    });

    return { memoriales, ilegibles };
  }

  async function obtener(id: string): Promise<Memorial | null> {
    const registro = await obtenerVigente(almacen, TIPO_MEMORIAL, id);
    return registro === null ? null : aMemorial(registro);
  }

  async function guardar(borrador: BorradorMemorial): Promise<Memorial> {
    const id = borrador.id ?? generarUuid();
    const existente = borrador.id === undefined ? null : await obtener(borrador.id);

    const contenido = esquemaContenidoMemorial.parse({
      titulo: borrador.titulo,
      relato: borrador.relato,
      personas: borrador.personas,
    });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_MEMORIAL,
      sobre: cifrar({
        contenido: JSON.stringify(contenido),
        clave: dependencias.claveMemorial(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(id),
      }),
      metadatos: {
        // La petición de origen no se pierde al editar el texto: es lo que
        // ata la respuesta a lo que se pidió.
        prayer_id: borrador.peticionId ?? existente?.peticionId ?? null,
        occurred_on: borrador.ocurrioEl ?? existente?.ocurrioEl ?? null,
        is_favorite: borrador.favorito ?? existente?.favorito ?? false,
      },
    });

    const guardado = aMemorial(registro);
    if (guardado === null) {
      throw new Error('El memorial recién guardado no se puede releer');
    }
    return guardado;
  }

  /** Marca o desmarca como favorito sin volver a cifrar el texto. */
  async function alternarFavorito(id: string): Promise<Memorial | null> {
    const registro = await obtenerVigente(almacen, TIPO_MEMORIAL, id);
    const actual = registro === null ? null : aMemorial(registro);
    if (registro === null || actual === null) return null;

    const actualizado = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_MEMORIAL,
      // El sobre se reutiliza: el texto no ha cambiado y volver a cifrarlo
      // generaría un criptograma nuevo sin motivo.
      sobre: registro.sobre,
      metadatos: {
        prayer_id: actual.peticionId,
        occurred_on: actual.ocurrioEl,
        is_favorite: !actual.favorito,
      },
    });

    return aMemorial(actualizado);
  }

  async function eliminar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_MEMORIAL, id);
  }

  return { listar, obtener, guardar, alternarFavorito, eliminar };
}

export type RepositorioMemorial = ReturnType<typeof crearRepositorioMemorial>;
