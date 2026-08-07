// Repositorio del Diario.
//
// Aquí ocurre el cruce entre el contenido en claro que maneja la aplicación y
// el sobre cifrado que es lo único que sale del dispositivo. Ninguna capa por
// encima ve un `SobreCifrado`, y ninguna por debajo ve una palabra del texto.
//
// Todo se escribe primero en local (invariante 4). La subida la hace el motor
// después y por su cuenta: guardar una entrada nunca espera a la red.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import { paginarDescifrando, type OpcionesPagina } from '@shared/database/paginacion';
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
 * Una página de la lista.
 *
 * Las entradas ilegibles se cuentan en lugar de esconderse. Pueden venir de
 * una clave rotada o de un registro dañado, y a quien le falte una entrada le
 * corresponde saberlo: desaparecer en silencio es peor que avisar. El recuento
 * es el de **esta** página, por lo explicado en `paginacion.ts`.
 */
export interface Lectura {
  readonly entradas: readonly EntradaDiario[];
  readonly ilegibles: number;
  /** Entradas que hay en total. Se sabe sin descifrar ninguna. */
  readonly total: number;
  /** Desde dónde pedir la siguiente página, o `null` si no hay más. */
  readonly siguiente: number | null;
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

  /**
   * Fecha por la que se ordena, leída **sin abrir el sobre**.
   *
   * `entry_date` viaja en claro desde el Documento 12 y es lo que permite
   * ordenar la lista entera sin descifrarla entera. Cuando falta se usa la de
   * creación, que también está en claro: un registro sin fecha no puede
   * quedarse fuera del orden y aparecer donde no toca.
   */
  const fechaDe = (registro: RegistroLocal): string =>
    typeof registro.metadatos.entry_date === 'string'
      ? registro.metadatos.entry_date
      : registro.creadoEn.slice(0, 10);

  /** Más recientes primero por fecha del diario; a igualdad, por escritura. */
  const masRecientePrimero = (a: RegistroLocal, b: RegistroLocal): number =>
    fechaDe(b).localeCompare(fechaDe(a)) || b.actualizadoEn.localeCompare(a.actualizadoEn);

  /**
   * Una página de la lista.
   *
   * Descifra **solo lo que devuelve**. Sin esto, abrir el Diario costaba
   * tanto como todo lo que la persona hubiera escrito en su vida: ver
   * `paginacion.ts` y la medida que lo motivó.
   */
  async function listar(opciones?: OpcionesPagina): Promise<Lectura> {
    const registros = await almacen.listar(TIPO_ENTIDAD);
    const pagina = paginarDescifrando({
      registros,
      ordenar: masRecientePrimero,
      leer: aEntrada,
      ...(opciones === undefined ? {} : { opciones }),
    });

    return {
      entradas: pagina.elementos,
      ilegibles: pagina.ilegibles,
      total: pagina.total,
      siguiente: pagina.siguiente,
    };
  }

  async function obtener(id: string): Promise<EntradaDiario | null> {
    const registro = await obtenerVigente(almacen, TIPO_ENTIDAD, id);
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
