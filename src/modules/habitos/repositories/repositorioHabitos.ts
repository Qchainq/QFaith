// Repositorio de Hábitos.
//
// Mismo patrón que Diario y Oración. Lo propio de este módulo es que marcar
// un día cumplido es **idempotente**: el esquema tiene una restricción única
// por (hábito, día), y aquí se respeta buscando el registro existente antes
// de crear otro. Sin eso, dos dispositivos sin conexión crearían dos filas
// del mismo día y el recuento saldría doblado.
import type { AlmacenLocal, Metadatos, RegistroLocal } from '@shared/database/tipos';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  CATEGORIAS_HABITO,
  esquemaConfiguracion,
  esquemaContenidoHabito,
  esquemaContenidoRegistro,
  FRECUENCIAS,
  type BorradorHabito,
  type CategoriaHabito,
  type ConfiguracionRepeticion,
  type Frecuencia,
  type Habito,
  type RegistroHabito,
} from '../models/habito';

export const TIPO_HABITO = 'habits';
export const TIPO_REGISTRO = 'habit_logs';

export interface DependenciasRepositorioHabitos {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveHabito: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
  readonly ahora?: () => string;
}

export interface LecturaHabitos {
  readonly habitos: readonly Habito[];
  readonly ilegibles: number;
}

const esCategoria = (valor: unknown): valor is CategoriaHabito =>
  typeof valor === 'string' && (CATEGORIAS_HABITO as readonly string[]).includes(valor);

const esFrecuencia = (valor: unknown): valor is Frecuencia =>
  typeof valor === 'string' && (FRECUENCIAS as readonly string[]).includes(valor);

const textoONulo = (valor: unknown): string | null => (typeof valor === 'string' ? valor : null);

export function crearRepositorioHabitos(dependencias: DependenciasRepositorioHabitos) {
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
          clave: dependencias.claveHabito(),
          vinculo: vinculo(registro.tipoEntidad, registro.id),
        }),
      );
    } catch {
      return null;
    }
  }

  function sobreDe(contenido: unknown, tipoEntidad: string, id: string) {
    return cifrar({
      contenido: JSON.stringify(contenido),
      clave: dependencias.claveHabito(),
      claveHash: dependencias.claveHash(),
      vinculo: vinculo(tipoEntidad, id),
    });
  }

  function aHabito(registro: RegistroLocal): Habito | null {
    const bruto = abrir(registro);
    if (bruto === null) return null;

    const contenido = esquemaContenidoHabito.safeParse(bruto);
    if (!contenido.success) return null;

    const configuracion = esquemaConfiguracion.safeParse(registro.metadatos.schedule_config);
    const frecuencia = registro.metadatos.frequency;
    const categoria = registro.metadatos.category_code;

    return {
      id: registro.id,
      ...contenido.data,
      categoria: esCategoria(categoria) ? categoria : null,
      frecuencia: esFrecuencia(frecuencia) ? frecuencia : 'daily',
      configuracion: configuracion.success ? configuracion.data : { dias: [] },
      fechaInicio: textoONulo(registro.metadatos.start_date) ?? registro.creadoEn.slice(0, 10),
      fechaFin: textoONulo(registro.metadatos.end_date),
      recordatorioActivo: registro.metadatos.reminder_enabled === true,
      horaRecordatorio: textoONulo(registro.metadatos.reminder_time),
      activo: registro.metadatos.is_active !== false,
      creadoEn: registro.creadoEn,
      actualizadoEn: registro.actualizadoEn,
    };
  }

  function aRegistro(registro: RegistroLocal): RegistroHabito | null {
    const bruto = abrir(registro);
    if (bruto === null) return null;

    const contenido = esquemaContenidoRegistro.safeParse(bruto);
    const habitoId = registro.metadatos.habit_id;
    const fecha = registro.metadatos.completion_date;
    if (!contenido.success || typeof habitoId !== 'string' || typeof fecha !== 'string') {
      return null;
    }

    return { id: registro.id, habitoId, fecha, nota: contenido.data.nota };
  }

  function metadatosDe(habito: {
    readonly categoria: CategoriaHabito | null;
    readonly frecuencia: Frecuencia;
    readonly configuracion: ConfiguracionRepeticion;
    readonly fechaInicio: string;
    readonly fechaFin: string | null;
    readonly recordatorioActivo: boolean;
    readonly horaRecordatorio: string | null;
    readonly activo: boolean;
  }): Metadatos {
    return {
      category_code: habito.categoria,
      frequency: habito.frecuencia,
      schedule_config: habito.configuracion,
      start_date: habito.fechaInicio,
      end_date: habito.fechaFin,
      reminder_enabled: habito.recordatorioActivo,
      reminder_time: habito.horaRecordatorio,
      is_active: habito.activo,
      sort_order: 0,
    };
  }

  async function listar(): Promise<LecturaHabitos> {
    const registros = await almacen.listar(TIPO_HABITO);
    const habitos: Habito[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const habito = aHabito(registro);
      if (habito === null) ilegibles += 1;
      else habitos.push(habito);
    }

    // Los activos primero, y dentro de cada grupo por antigüedad.
    habitos.sort(
      (a, b) => Number(b.activo) - Number(a.activo) || a.creadoEn.localeCompare(b.creadoEn),
    );

    return { habitos, ilegibles };
  }

  async function obtener(id: string): Promise<Habito | null> {
    const registro = await almacen.obtener(TIPO_HABITO, id);
    return registro === null ? null : aHabito(registro);
  }

  async function guardar(borrador: BorradorHabito): Promise<Habito> {
    const id = borrador.id ?? generarUuid();
    const existente = borrador.id === undefined ? null : await obtener(borrador.id);

    const contenido = esquemaContenidoHabito.parse({
      titulo: borrador.titulo,
      descripcion: borrador.descripcion,
    });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_HABITO,
      sobre: sobreDe(contenido, TIPO_HABITO, id),
      metadatos: metadatosDe({
        categoria: borrador.categoria ?? existente?.categoria ?? null,
        frecuencia: borrador.frecuencia ?? existente?.frecuencia ?? 'daily',
        configuracion: borrador.configuracion ?? existente?.configuracion ?? { dias: [] },
        fechaInicio: borrador.fechaInicio ?? existente?.fechaInicio ?? ahora().slice(0, 10),
        fechaFin: existente?.fechaFin ?? null,
        recordatorioActivo: existente?.recordatorioActivo ?? false,
        horaRecordatorio: existente?.horaRecordatorio ?? null,
        activo: borrador.activo ?? existente?.activo ?? true,
      }),
    });

    const guardado = aHabito(registro);
    if (guardado === null) {
      throw new Error('El hábito recién guardado no se puede releer');
    }
    return guardado;
  }

  async function eliminar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_HABITO, id);
  }

  async function registrosDe(habitoId: string): Promise<readonly RegistroHabito[]> {
    const registros = await almacen.listar(TIPO_REGISTRO);
    return registros
      .map(aRegistro)
      .filter(
        (registro): registro is RegistroHabito =>
          registro !== null && registro.habitoId === habitoId,
      );
  }

  /**
   * Marca un día como cumplido. Repetirlo no duplica nada.
   *
   * La idempotencia no es una comodidad: el esquema tiene una restricción
   * única por (hábito, día), y dos dispositivos sin conexión chocarían con
   * ella. Reusar el identificador del registro que ya existe convierte el
   * choque en una actualización normal.
   */
  async function marcarCumplido(parametros: {
    readonly habitoId: string;
    readonly fecha: string;
    readonly nota?: string;
  }): Promise<RegistroHabito> {
    const existentes = await registrosDe(parametros.habitoId);
    const id =
      existentes.find((registro) => registro.fecha === parametros.fecha)?.id ?? generarUuid();
    const contenido = esquemaContenidoRegistro.parse({ nota: parametros.nota ?? '' });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_REGISTRO,
      sobre: sobreDe(contenido, TIPO_REGISTRO, id),
      metadatos: {
        habit_id: parametros.habitoId,
        completion_date: parametros.fecha,
        completed: true,
        completed_at: ahora(),
      },
    });

    const guardado = aRegistro(registro);
    if (guardado === null) {
      throw new Error('El registro recién guardado no se puede releer');
    }
    return guardado;
  }

  /** Deshace la marca del día. No deja constancia de un fallo: la retira. */
  async function deshacerCumplido(habitoId: string, fecha: string): Promise<void> {
    const existente = (await registrosDe(habitoId)).find((registro) => registro.fecha === fecha);
    if (existente !== undefined) {
      await motor.registrarEliminacionLocal(TIPO_REGISTRO, existente.id);
    }
  }

  /** Días cumplidos de un hábito, de más reciente a más antiguo. */
  async function diasCumplidos(habitoId: string): Promise<readonly string[]> {
    return (await registrosDe(habitoId))
      .map((registro) => registro.fecha)
      .sort((a, b) => b.localeCompare(a));
  }

  return { listar, obtener, guardar, eliminar, marcarCumplido, deshacerCumplido, diasCumplidos };
}

export type RepositorioHabitos = ReturnType<typeof crearRepositorioHabitos>;
