// Repositorio del Pulso Espiritual.
//
// Lo propio de este módulo es que **parte del registro va en claro a
// propósito**: el `mood_code` lo necesita el servidor para preparar el
// acompañamiento sin descargar la vida entera de alguien. La nota, que es
// donde de verdad se cuenta algo, va cifrada.
//
// Y hay un registro por día: responder dos veces corrige la respuesta, no
// añade otra. Sin eso, dos dispositivos sin conexión dejarían dos pulsos del
// mismo día y ninguno sabría cuál vale.
import type { AlmacenLocal, RegistroLocal } from '@shared/database/tipos';
import { generarUuidDesde } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  ESTADOS_PULSO,
  esquemaContenidoPulso,
  type BorradorPulso,
  type EstadoPulso,
  type Pulso,
} from '../models/pulso';

export const TIPO_PULSO = 'spiritual_pulses';

export interface DependenciasRepositorioPulso {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly clavePulso: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

const esEstado = (valor: unknown): valor is EstadoPulso =>
  typeof valor === 'string' && (ESTADOS_PULSO as readonly string[]).includes(valor);

export function crearRepositorioPulso(dependencias: DependenciasRepositorioPulso) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_PULSO,
    entidadId,
  });

  /**
   * Identificador derivado del día.
   *
   * Dos dispositivos sin conexión que respondan el mismo día calculan el
   * mismo identificador, así que el segundo corrige al primero en lugar de
   * chocar contra la restricción única del servidor.
   */
  const idDelDia = (fecha: string): string => generarUuidDesde(`pulso/${usuarioId}/${fecha}`);

  function aPulso(registro: RegistroLocal): Pulso | null {
    const estado = registro.metadatos.mood_code;
    const fecha = registro.metadatos.pulse_date;
    if (!esEstado(estado) || typeof fecha !== 'string') return null;

    let nota = '';
    const sobre = registro.sobre;
    // La nota es opcional: sin ella el sobre está vacío y eso no es un error.
    if (sobre.encryptedPayload.length > 0) {
      try {
        const contenido = esquemaContenidoPulso.safeParse(
          JSON.parse(
            descifrar({ sobre, clave: dependencias.clavePulso(), vinculo: vinculo(registro.id) }),
          ),
        );
        // Una nota que no abre no invalida el pulso: el estado y el día siguen
        // siendo legibles y son lo que la pantalla necesita.
        nota = contenido.success ? contenido.data.nota : '';
      } catch {
        nota = '';
      }
    }

    const intensidad = registro.metadatos.intensity;
    return {
      id: registro.id,
      fecha,
      estado,
      intensidad: typeof intensidad === 'number' ? intensidad : null,
      nota,
      creadoEn: registro.creadoEn,
    };
  }

  async function listar(): Promise<readonly Pulso[]> {
    const registros = await almacen.listar(TIPO_PULSO);
    return registros
      .map(aPulso)
      .filter((pulso): pulso is Pulso => pulso !== null)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  async function deLaFecha(fecha: string): Promise<Pulso | null> {
    const registro = await almacen.obtener(TIPO_PULSO, idDelDia(fecha));
    return registro === null ? null : aPulso(registro);
  }

  async function guardar(borrador: BorradorPulso): Promise<Pulso> {
    const id = idDelDia(borrador.fecha);
    const nota = borrador.nota ?? '';

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_PULSO,
      sobre: cifrar({
        // Sin nota se cifra una nota vacía en lugar de omitir el sobre: así
        // el motor trata todas las filas igual y no hay dos formas de leerlas.
        contenido: JSON.stringify(esquemaContenidoPulso.parse({ nota })),
        clave: dependencias.clavePulso(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(id),
      }),
      metadatos: {
        pulse_date: borrador.fecha,
        mood_code: borrador.estado,
        intensity: borrador.intensidad ?? null,
      },
    });

    const guardado = aPulso(registro);
    if (guardado === null) throw new Error('El pulso recién guardado no se puede releer');
    return guardado;
  }

  async function eliminar(fecha: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_PULSO, idDelDia(fecha));
  }

  return { listar, deLaFecha, guardar, eliminar, idDelDia };
}

export type RepositorioPulso = ReturnType<typeof crearRepositorioPulso>;
