// Seguimiento personal de un plan de lectura.
//
// La mitad privada del módulo: por dónde va cada persona y qué escribió al
// leer. Va por el motor como el resto del contenido propio.
//
// Toda la lógica de este archivo se reduce a una frase: **el plan avanza
// cuando alguien lee, nunca cuando pasa el tiempo.** Aquí no se llama a
// `Date` para decidir nada; solo para poner la marca de cuándo se completó un
// día, que es un dato, no una condición. Si en algún momento aparece una resta
// de fechas en este archivo, algo se ha torcido (invariante 12).
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { obtenerVigente } from '@shared/database/lecturaVigente';
import { generarUuid, generarUuidDesde } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  esEstadoInscripcion,
  esquemaContenidoProgreso,
  siguienteDia,
  terminaElPlan,
  type DiaCompletado,
  type EstadoInscripcion,
  type Inscripcion,
} from '../models/plan';

export const TIPO_INSCRIPCION = 'user_reading_plans';
export const TIPO_PROGRESO = 'reading_progress';

/** Estados en los que una inscripción ocupa el sitio del plan. */
const VIVOS: readonly EstadoInscripcion[] = ['active', 'paused'];

export interface DependenciasRepositorioSeguimiento {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly clavePlanes: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
  /** Inyectable para las pruebas. Solo marca instantes, nunca decide nada. */
  readonly ahora?: () => Date;
}

export function crearRepositorioSeguimiento(dependencias: DependenciasRepositorioSeguimiento) {
  const { motor, almacen, usuarioId } = dependencias;
  const ahora = dependencias.ahora ?? (() => new Date());

  const vinculo = (tipoEntidad: string, entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad,
    entidadId,
  });

  /**
   * Identificador de un día, derivado de la inscripción y el número.
   *
   * Dos dispositivos sin conexión que completen el mismo día calculan el mismo
   * identificador, de modo que el segundo corrige al primero en vez de chocar
   * contra la restricción única del servidor.
   */
  const idDelDia = (inscripcionId: string, numero: number): string =>
    generarUuidDesde(`progreso/${usuarioId}/${inscripcionId}/${numero}`);

  function aInscripcion(registro: RegistroLocal): Inscripcion | null {
    const { metadatos } = registro;
    if (typeof metadatos.plan_id !== 'string') return null;
    const dia = metadatos.current_day;
    const estado = metadatos.status;
    const empezado = metadatos.started_at;

    return {
      id: registro.id,
      planId: metadatos.plan_id,
      diaActual: typeof dia === 'number' ? dia : 1,
      estado: esEstadoInscripcion(estado) ? estado : 'active',
      empezadoEn: typeof empezado === 'string' ? empezado : registro.creadoEn.slice(0, 10),
      completadoEn: typeof metadatos.completed_at === 'string' ? metadatos.completed_at : null,
    };
  }

  function aDia(registro: RegistroLocal): DiaCompletado | null {
    const { metadatos } = registro;
    if (typeof metadatos.user_plan_id !== 'string' || typeof metadatos.day_number !== 'number') {
      return null;
    }

    let reflexion = '';
    // Una reflexión que no abre no invalida el día: haberlo leído sigue siendo
    // cierto, y es lo que la pantalla necesita saber.
    if (registro.sobre.encryptedPayload.length > 0) {
      try {
        const contenido = esquemaContenidoProgreso.safeParse(
          JSON.parse(
            descifrar({
              sobre: registro.sobre,
              clave: dependencias.clavePlanes(),
              vinculo: vinculo(TIPO_PROGRESO, registro.id),
            }),
          ),
        );
        reflexion = contenido.success ? contenido.data.reflexion : '';
      } catch {
        reflexion = '';
      }
    }

    return {
      inscripcionId: metadatos.user_plan_id,
      numero: metadatos.day_number,
      completadoEn: typeof metadatos.completed_at === 'string' ? metadatos.completed_at : null,
      reflexion,
    };
  }

  /** Inscripciones vigentes, de la más reciente a la más antigua. */
  async function inscripciones(): Promise<readonly Inscripcion[]> {
    const registros = await almacen.listar(TIPO_INSCRIPCION);
    return registros
      .map(aInscripcion)
      .filter((i): i is Inscripcion => i !== null)
      .sort((a, b) => b.empezadoEn.localeCompare(a.empezadoEn));
  }

  const vivaDelPlan = async (planId: string): Promise<Inscripcion | null> =>
    (await inscripciones()).find((i) => i.planId === planId && VIVOS.includes(i.estado)) ?? null;

  /**
   * Empieza un plan.
   *
   * Si ya hay una inscripción viva al mismo plan, se devuelve esa: apuntarse
   * dos veces es apuntarse una. Si la anterior se abandonó o se completó, sí
   * se crea una nueva — volver a hacer un plan es algo que la gente hace, y
   * el recorrido anterior no se pisa.
   */
  async function empezar(planId: string): Promise<Inscripcion> {
    const yaViva = await vivaDelPlan(planId);
    if (yaViva !== null) return yaViva;

    const id = generarUuid();
    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_INSCRIPCION,
      // La inscripción no tiene nada privado que cifrar: qué plan sigue
      // alguien no dice nada de él que el catálogo no diga ya. Lo íntimo es
      // lo que escribe, y eso va en el progreso.
      sobre: cifrar({
        contenido: '{}',
        clave: dependencias.clavePlanes(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_INSCRIPCION, id),
      }),
      metadatos: {
        plan_id: planId,
        current_day: 1,
        status: 'active',
        started_at: ahora().toISOString().slice(0, 10),
        completed_at: null,
      },
    });

    const inscripcion = aInscripcion(registro);
    if (inscripcion === null) throw new Error('La inscripción recién creada no se puede releer');
    return inscripcion;
  }

  async function guardarInscripcion(
    registro: RegistroLocal,
    cambios: Record<string, string | number | null>,
  ): Promise<Inscripcion> {
    const guardado = await motor.registrarCambioLocal({
      id: registro.id,
      tipoEntidad: TIPO_INSCRIPCION,
      sobre: registro.sobre,
      metadatos: { ...registro.metadatos, ...cambios },
    });
    const inscripcion = aInscripcion(guardado);
    if (inscripcion === null) throw new Error('La inscripción guardada no se puede releer');
    return inscripcion;
  }

  async function exigirInscripcion(id: string): Promise<RegistroLocal> {
    const registro = await obtenerVigente(almacen, TIPO_INSCRIPCION, id);
    if (registro === null) throw new Error('La inscripción no existe');
    return registro;
  }

  /** Días de una inscripción, en orden. */
  async function diasDe(inscripcionId: string): Promise<readonly DiaCompletado[]> {
    const registros = await almacen.listar(TIPO_PROGRESO);
    return registros
      .map(aDia)
      .filter((dia): dia is DiaCompletado => dia !== null && dia.inscripcionId === inscripcionId)
      .sort((a, b) => a.numero - b.numero);
  }

  /**
   * Cuántos días ha leído la persona en cada inscripción.
   *
   * De una sola pasada sobre lo que ya está en local, en vez de una consulta
   * por plan. La lista de planes necesita este número para todos a la vez, y
   * pedirlo uno a uno sería una consulta por fila en pantalla.
   *
   * Es un recuento de lo recorrido, nunca un porcentaje de cumplimiento: dice
   * cuánto has leído, no cuánto te falta (invariante 12).
   */
  async function leidosPorInscripcion(): Promise<ReadonlyMap<string, number>> {
    const registros = await almacen.listar(TIPO_PROGRESO);
    const cuenta = new Map<string, number>();

    for (const registro of registros) {
      const dia = aDia(registro);
      // Un día sin marca de completado existe porque alguien escribió algo y
      // no llegó a marcarlo; no cuenta como leído.
      if (dia === null || dia.completadoEn === null) continue;
      cuenta.set(dia.inscripcionId, (cuenta.get(dia.inscripcionId) ?? 0) + 1);
    }
    return cuenta;
  }

  /**
   * Marca un día como leído y guarda la reflexión.
   *
   * El plan avanza aquí y en ningún otro sitio. `siguienteDia` decide, y solo
   * mira números: el día en el que se estaba, el que se acaba de completar y
   * cuántos tiene el plan. Nunca la fecha.
   */
  async function completarDia(parametros: {
    readonly inscripcionId: string;
    readonly numero: number;
    readonly totalDias: number;
    readonly reflexion?: string;
  }): Promise<{ inscripcion: Inscripcion; dia: DiaCompletado }> {
    const registroInscripcion = await exigirInscripcion(parametros.inscripcionId);
    const inscripcion = aInscripcion(registroInscripcion);
    if (inscripcion === null) throw new Error('La inscripción no se puede leer');

    const idDia = idDelDia(parametros.inscripcionId, parametros.numero);
    const instante = ahora().toISOString();

    const registroDia = await motor.registrarCambioLocal({
      id: idDia,
      tipoEntidad: TIPO_PROGRESO,
      sobre: cifrar({
        // Sin reflexión se cifra una vacía en lugar de omitir el sobre: así el
        // motor trata todas las filas igual y no hay dos formas de leerlas.
        contenido: JSON.stringify(
          esquemaContenidoProgreso.parse({ reflexion: parametros.reflexion ?? '' }),
        ),
        clave: dependencias.clavePlanes(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_PROGRESO, idDia),
      }),
      metadatos: {
        user_plan_id: parametros.inscripcionId,
        day_number: parametros.numero,
        completed_at: instante,
      },
    });

    const termina = terminaElPlan({
      diaCompletado: parametros.numero,
      totalDias: parametros.totalDias,
    });

    const actualizada = await guardarInscripcion(registroInscripcion, {
      current_day: siguienteDia({
        diaActual: inscripcion.diaActual,
        diaCompletado: parametros.numero,
        totalDias: parametros.totalDias,
      }),
      // Terminar el plan solo ocurre al completar el último día. Marcar un día
      // suelto del final no lo da por acabado.
      ...(termina && parametros.numero === inscripcion.diaActual
        ? { status: 'completed', completed_at: instante.slice(0, 10) }
        : {}),
    });

    const dia = aDia(registroDia);
    if (dia === null) throw new Error('El día recién guardado no se puede releer');
    return { inscripcion: actualizada, dia };
  }

  /**
   * Reescribe la reflexión de un día ya leído sin tocar el avance.
   *
   * Existe aparte de `completarDia` porque volver sobre lo que uno escribió no
   * es volver a leer el día, y no debe mover el plan.
   */
  async function reescribirReflexion(parametros: {
    readonly inscripcionId: string;
    readonly numero: number;
    readonly reflexion: string;
  }): Promise<DiaCompletado> {
    const idDia = idDelDia(parametros.inscripcionId, parametros.numero);
    const previo = await obtenerVigente(almacen, TIPO_PROGRESO, idDia);

    const registro = await motor.registrarCambioLocal({
      id: idDia,
      tipoEntidad: TIPO_PROGRESO,
      sobre: cifrar({
        contenido: JSON.stringify(
          esquemaContenidoProgreso.parse({ reflexion: parametros.reflexion }),
        ),
        clave: dependencias.clavePlanes(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(TIPO_PROGRESO, idDia),
      }),
      metadatos: {
        user_plan_id: parametros.inscripcionId,
        day_number: parametros.numero,
        // Se conserva la marca original. Reescribir hoy lo que se leyó el
        // martes no convierte el martes en hoy.
        completed_at:
          typeof previo?.metadatos.completed_at === 'string' ? previo.metadatos.completed_at : null,
      },
    });

    const dia = aDia(registro);
    if (dia === null) throw new Error('El día guardado no se puede releer');
    return dia;
  }

  /** Pausar y retomar. Ninguna de las dos cosas cuesta nada ni pierde nada. */
  const pausar = async (id: string): Promise<Inscripcion> =>
    guardarInscripcion(await exigirInscripcion(id), { status: 'paused' });

  const retomar = async (id: string): Promise<Inscripcion> =>
    guardarInscripcion(await exigirInscripcion(id), { status: 'active' });

  /**
   * Abandonar un plan.
   *
   * No es un borrado: el recorrido se conserva y el plan se puede volver a
   * empezar más tarde. Dejar algo a medias es una decisión legítima y el
   * esquema no la castiga.
   */
  const abandonar = async (id: string): Promise<Inscripcion> =>
    guardarInscripcion(await exigirInscripcion(id), { status: 'abandoned' });

  /** Retira la inscripción a la papelera, con sus días. */
  async function retirar(id: string): Promise<void> {
    for (const dia of await diasDe(id)) {
      await motor.registrarEliminacionLocal(TIPO_PROGRESO, idDelDia(id, dia.numero));
    }
    await motor.registrarEliminacionLocal(TIPO_INSCRIPCION, id);
  }

  return {
    inscripciones,
    leidosPorInscripcion,
    vivaDelPlan,
    empezar,
    completarDia,
    reescribirReflexion,
    diasDe,
    pausar,
    retomar,
    abandonar,
    retirar,
    idDelDia,
  };
}

export type RepositorioSeguimiento = ReturnType<typeof crearRepositorioSeguimiento>;
