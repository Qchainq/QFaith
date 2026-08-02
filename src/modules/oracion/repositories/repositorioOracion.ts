// Repositorio de Oración.
//
// Mismo patrón que el Diario, con dos diferencias que vienen del dominio:
//
//   · Una petición no se borra al ser respondida. Cambia de estado y guarda
//     la fecha, porque el recorrido es justo lo que después da sentido al
//     memorial (Documento 12).
//   · Los avances viven en su propia tabla. Sobrescribir la petición cada vez
//     perdería la cronología, que es lo que hace valiosa una respuesta.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  CATEGORIAS_PETICION,
  ESTADOS_PETICION,
  esquemaContenidoAvance,
  esquemaContenidoPeticion,
  type AvancePeticion,
  type BorradorPeticion,
  type CategoriaPeticion,
  type EstadoPeticion,
  type Peticion,
} from '../models/peticion';

export const TIPO_PETICION = 'prayers';
export const TIPO_AVANCE = 'prayer_updates';

export interface DependenciasRepositorioOracion {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveOracion: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
  readonly ahora?: () => string;
}

export interface LecturaPeticiones {
  readonly peticiones: readonly Peticion[];
  readonly ilegibles: number;
}

const esEstado = (valor: unknown): valor is EstadoPeticion =>
  typeof valor === 'string' && (ESTADOS_PETICION as readonly string[]).includes(valor);

const esCategoria = (valor: unknown): valor is CategoriaPeticion =>
  typeof valor === 'string' && (CATEGORIAS_PETICION as readonly string[]).includes(valor);

const textoONulo = (valor: unknown): string | null => (typeof valor === 'string' ? valor : null);

export function crearRepositorioOracion(dependencias: DependenciasRepositorioOracion) {
  const { motor, almacen, usuarioId } = dependencias;
  const ahora = dependencias.ahora ?? (() => new Date().toISOString());

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
          clave: dependencias.claveOracion(),
          vinculo: vinculo(registro.tipoEntidad, registro.id),
        }),
      );
    } catch {
      // Ni el identificador ni el motivo se registran: dirían cuántas
      // peticiones tiene alguien y cuándo las escribió (invariante 2).
      return null;
    }
  }

  function aPeticion(registro: RegistroLocal): Peticion | null {
    const bruto = abrir(registro);
    if (bruto === null) return null;

    const contenido = esquemaContenidoPeticion.safeParse(bruto);
    if (!contenido.success) return null;

    const estado = registro.metadatos.status;
    const categoria = registro.metadatos.category_code;

    return {
      id: registro.id,
      ...contenido.data,
      estado: esEstado(estado) ? estado : 'active',
      categoria: esCategoria(categoria) ? categoria : null,
      recordatorioActivo: registro.metadatos.reminder_enabled === true,
      proximoRecordatorio: textoONulo(registro.metadatos.next_reminder_at),
      respondidaEn: textoONulo(registro.metadatos.answered_at),
      archivadaEn: textoONulo(registro.metadatos.archived_at),
      creadaEn: registro.creadoEn,
      actualizadaEn: registro.actualizadoEn,
    };
  }

  function aAvance(registro: RegistroLocal): AvancePeticion | null {
    const bruto = abrir(registro);
    if (bruto === null) return null;

    const contenido = esquemaContenidoAvance.safeParse(bruto);
    const peticionId = registro.metadatos.prayer_id;
    if (!contenido.success || typeof peticionId !== 'string') return null;

    return {
      id: registro.id,
      peticionId,
      texto: contenido.data.texto,
      creadoEn: registro.creadoEn,
    };
  }

  function metadatosDe(peticion: {
    readonly estado: EstadoPeticion;
    readonly categoria: CategoriaPeticion | null;
    readonly recordatorioActivo: boolean;
    readonly proximoRecordatorio: string | null;
    readonly respondidaEn: string | null;
    readonly archivadaEn: string | null;
  }): Record<string, string | number | boolean | null> {
    return {
      status: peticion.estado,
      // Privada por defecto y siempre: compartir es del módulo Iglesia y es un
      // acto voluntario y explícito, nunca un efecto secundario de guardar.
      visibility: 'private',
      category_code: peticion.categoria,
      reminder_enabled: peticion.recordatorioActivo,
      next_reminder_at: peticion.proximoRecordatorio,
      answered_at: peticion.respondidaEn,
      archived_at: peticion.archivadaEn,
    };
  }

  async function listar(): Promise<LecturaPeticiones> {
    const registros = await almacen.listar(TIPO_PETICION);
    const peticiones: Peticion[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const peticion = aPeticion(registro);
      if (peticion === null) ilegibles += 1;
      else peticiones.push(peticion);
    }

    // Las activas primero: son las que la persona está viviendo ahora.
    const orden: Record<EstadoPeticion, number> = { active: 0, answered: 1, archived: 2 };
    peticiones.sort(
      (a, b) => orden[a.estado] - orden[b.estado] || b.actualizadaEn.localeCompare(a.actualizadaEn),
    );

    return { peticiones, ilegibles };
  }

  async function obtener(id: string): Promise<Peticion | null> {
    const registro = await almacen.obtener(TIPO_PETICION, id);
    return registro === null ? null : aPeticion(registro);
  }

  async function guardar(borrador: BorradorPeticion): Promise<Peticion> {
    const id = borrador.id ?? generarUuid();
    const existente = borrador.id === undefined ? null : await obtener(borrador.id);

    const contenido = esquemaContenidoPeticion.parse({
      titulo: borrador.titulo,
      detalle: borrador.detalle,
      personas: borrador.personas,
    });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_PETICION,
      sobre: cifrar({
        contenido: JSON.stringify(contenido),
        clave: dependencias.claveOracion(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_PETICION, id),
      }),
      metadatos: metadatosDe({
        // Editar el texto no cambia el estado: para eso están `responder` y
        // `archivar`, que son decisiones distintas.
        estado: existente?.estado ?? 'active',
        categoria: borrador.categoria ?? existente?.categoria ?? null,
        recordatorioActivo: borrador.recordatorioActivo ?? existente?.recordatorioActivo ?? false,
        proximoRecordatorio: borrador.proximoRecordatorio ?? existente?.proximoRecordatorio ?? null,
        respondidaEn: existente?.respondidaEn ?? null,
        archivadaEn: existente?.archivadaEn ?? null,
      }),
    });

    const guardada = aPeticion(registro);
    if (guardada === null) {
      throw new Error('La petición recién guardada no se puede releer');
    }
    return guardada;
  }

  /** Cambia el estado conservando el contenido cifrado tal cual. */
  async function cambiarEstado(id: string, estado: EstadoPeticion): Promise<Peticion | null> {
    const registro = await almacen.obtener(TIPO_PETICION, id);
    const actual = registro === null ? null : aPeticion(registro);
    if (registro === null || actual === null) {
      return null;
    }

    const instante = ahora();
    const actualizado = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_PETICION,
      // El sobre no se vuelve a cifrar: el texto no ha cambiado y volver a
      // hacerlo generaría un criptograma nuevo sin motivo.
      sobre: registro.sobre,
      metadatos: metadatosDe({
        estado,
        categoria: actual.categoria,
        recordatorioActivo: actual.recordatorioActivo,
        proximoRecordatorio: actual.proximoRecordatorio,
        respondidaEn: estado === 'answered' ? (actual.respondidaEn ?? instante) : null,
        archivadaEn: estado === 'archived' ? (actual.archivadaEn ?? instante) : null,
      }),
    });

    return aPeticion(actualizado);
  }

  async function eliminar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_PETICION, id);
  }

  /** Anota un avance. No modifica la petición: se añade a su cronología. */
  async function anotarAvance(peticionId: string, texto: string): Promise<AvancePeticion> {
    const id = generarUuid();
    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_AVANCE,
      sobre: cifrar({
        contenido: JSON.stringify(esquemaContenidoAvance.parse({ texto })),
        clave: dependencias.claveOracion(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_AVANCE, id),
      }),
      metadatos: { prayer_id: peticionId },
    });

    const avance = aAvance(registro);
    if (avance === null) {
      throw new Error('El avance recién guardado no se puede releer');
    }
    return avance;
  }

  async function listarAvances(peticionId: string): Promise<readonly AvancePeticion[]> {
    const registros = await almacen.listar(TIPO_AVANCE);
    return registros
      .map(aAvance)
      .filter(
        (avance): avance is AvancePeticion => avance !== null && avance.peticionId === peticionId,
      )
      .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  }

  return { listar, obtener, guardar, cambiarEstado, eliminar, anotarAvance, listarAvances };
}

export type RepositorioOracion = ReturnType<typeof crearRepositorioOracion>;
