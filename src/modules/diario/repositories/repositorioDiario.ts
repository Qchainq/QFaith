// Repositorio del Diario.
//
// Aquí ocurre el cruce entre el contenido en claro que maneja la aplicación y
// el sobre cifrado que es lo único que sale del dispositivo. Ninguna capa por
// encima ve un `SobreCifrado`, y ninguna por debajo ve una palabra del texto.
//
// Todo se escribe primero en local (invariante 4). La subida la hace el motor
// después y por su cuenta: guardar una entrada nunca espera a la red.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  esquemaContenidoPrivado,
  TIPOS_ENTRADA,
  type BorradorEntrada,
  type EntradaDiario,
  type TipoEntrada,
} from '../models/entradaDiario';

/** La tabla del esquema que respalda este módulo. */
export const TIPO_ENTIDAD = 'journal_entries';

export interface DependenciasRepositorio {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  /** Se piden en cada operación: el material no se guarda aquí ni se cachea. */
  readonly claveDiario: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

/**
 * Resultado de una lectura.
 *
 * Las entradas ilegibles se cuentan en lugar de esconderse. Pueden venir de
 * una clave rotada o de un registro dañado, y a quien le falte una entrada le
 * corresponde saberlo: desaparecer en silencio es peor que avisar.
 */
export interface Lectura {
  readonly entradas: readonly EntradaDiario[];
  readonly ilegibles: number;
}

const esTipoEntrada = (valor: unknown): valor is TipoEntrada =>
  typeof valor === 'string' && (TIPOS_ENTRADA as readonly string[]).includes(valor);

export function crearRepositorioDiario(dependencias: DependenciasRepositorio) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_ENTIDAD,
    entidadId,
  });

  /** Metadatos que el servidor sí puede leer, y solo estos. */
  function metadatosDe(borrador: BorradorEntrada): Record<string, string | number | boolean> {
    return {
      entry_type: borrador.tipo,
      entry_date: borrador.fecha,
      is_favorite: borrador.esFavorita ?? false,
      is_ark_protected: borrador.protegidaConArca ?? false,
    };
  }

  function aEntrada(registro: RegistroLocal): EntradaDiario | null {
    let contenido;
    try {
      const texto = descifrar({
        sobre: registro.sobre,
        clave: dependencias.claveDiario(),
        vinculo: vinculo(registro.id),
      });
      contenido = esquemaContenidoPrivado.parse(JSON.parse(texto));
    } catch {
      // Nunca se registra el motivo ni el identificador: bastaría para saber
      // cuántas entradas tiene alguien y cuándo las escribió (invariante 2).
      return null;
    }

    const tipoBruto = registro.metadatos.entry_type;
    const fecha = registro.metadatos.entry_date;

    return {
      id: registro.id,
      ...contenido,
      tipo: esTipoEntrada(tipoBruto) ? tipoBruto : 'general',
      fecha: typeof fecha === 'string' ? fecha : registro.creadoEn.slice(0, 10),
      esFavorita: registro.metadatos.is_favorite === true,
      protegidaConArca: registro.metadatos.is_ark_protected === true,
      creadaEn: registro.creadoEn,
      actualizadaEn: registro.actualizadoEn,
    };
  }

  async function listar(): Promise<Lectura> {
    const registros = await almacen.listar(TIPO_ENTIDAD);
    const entradas: EntradaDiario[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const entrada = aEntrada(registro);
      if (entrada === null) {
        ilegibles += 1;
      } else {
        entradas.push(entrada);
      }
    }

    // Más recientes primero por fecha del diario; a igualdad, por escritura.
    entradas.sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.actualizadaEn.localeCompare(a.actualizadaEn),
    );

    return { entradas, ilegibles };
  }

  async function obtener(id: string): Promise<EntradaDiario | null> {
    const registro = await almacen.obtener(TIPO_ENTIDAD, id);
    return registro === null ? null : aEntrada(registro);
  }

  /**
   * Crea o modifica una entrada.
   *
   * El identificador se decide **antes** de cifrar porque forma parte de los
   * datos autenticados: es lo que impide mover un criptograma a otra fila.
   */
  async function guardar(borrador: BorradorEntrada): Promise<EntradaDiario> {
    const id = borrador.id ?? generarUuid();
    const contenido = esquemaContenidoPrivado.parse({
      titulo: borrador.titulo,
      cuerpo: borrador.cuerpo,
      etiquetas: borrador.etiquetas,
    });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_ENTIDAD,
      sobre: cifrar({
        contenido: JSON.stringify(contenido),
        clave: dependencias.claveDiario(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(id),
      }),
      metadatos: metadatosDe(borrador),
    });

    const guardada = aEntrada(registro);
    if (guardada === null) {
      // Solo puede pasar si la clave de la sesión no es la que acaba de
      // cifrar, y entonces el registro sería irrecuperable.
      throw new Error('La entrada recién guardada no se puede releer');
    }
    return guardada;
  }

  /** Borrado lógico: la entrada va a la papelera, no desaparece (invariante 6). */
  async function eliminar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_ENTIDAD, id);
  }

  return { listar, obtener, guardar, eliminar };
}

export type RepositorioDiario = ReturnType<typeof crearRepositorioDiario>;
