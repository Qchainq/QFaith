// Repositorio de conversaciones con el asistente.
//
// Es el contenido más delicado de la aplicación: lo que alguien le cuenta a
// un acompañante que no le juzga suele ser lo que no le cuenta a nadie más.
// Va cifrado entero, y el borrado de memoria tiene que funcionar de verdad.
import type { AlmacenLocal, Metadatos, RegistroLocal } from '@shared/database/tipos';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import {
  esquemaContenidoConversacion,
  esquemaContenidoMensaje,
  TIPOS_CONVERSACION,
  type Conversacion,
  type Mensaje,
  type TipoConversacion,
} from '../models/conversacion';

export const TIPO_CONVERSACION = 'ai_conversations';
export const TIPO_MENSAJE = 'ai_messages';

export interface DependenciasRepositorioIa {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveIa: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

const esTipo = (valor: unknown): valor is TipoConversacion =>
  typeof valor === 'string' && (TIPOS_CONVERSACION as readonly string[]).includes(valor);

export function crearRepositorioIa(dependencias: DependenciasRepositorioIa) {
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
          clave: dependencias.claveIa(),
          vinculo: vinculo(registro.tipoEntidad, registro.id),
        }),
      );
    } catch {
      return null;
    }
  }

  const sobreDe = (contenido: unknown, tipoEntidad: string, id: string) =>
    cifrar({
      contenido: JSON.stringify(contenido),
      clave: dependencias.claveIa(),
      claveHash: dependencias.claveHash(),
      vinculo: vinculo(tipoEntidad, id),
    });

  function aConversacion(registro: RegistroLocal): Conversacion | null {
    const contenido = esquemaContenidoConversacion.safeParse(abrir(registro));
    if (!contenido.success) return null;

    const tipo = registro.metadatos.conversation_type;
    return {
      id: registro.id,
      titulo: contenido.data.titulo,
      tipo: esTipo(tipo) ? tipo : 'general',
      creadaEn: registro.creadoEn,
      actualizadaEn: registro.actualizadoEn,
    };
  }

  function aMensaje(registro: RegistroLocal): Mensaje | null {
    const contenido = esquemaContenidoMensaje.safeParse(abrir(registro));
    const conversacionId = registro.metadatos.conversation_id;
    const rol = registro.metadatos.role;
    if (!contenido.success || typeof conversacionId !== 'string') return null;

    return {
      id: registro.id,
      conversacionId,
      rol: rol === 'asistente' ? 'asistente' : 'usuario',
      texto: contenido.data.texto,
      categoriaSeguridad: registro.metadatos.safety_category === 'crisis' ? 'crisis' : null,
      creadoEn: registro.creadoEn,
    };
  }

  async function conversaciones(): Promise<readonly Conversacion[]> {
    const registros = await almacen.listar(TIPO_CONVERSACION);
    return registros
      .map(aConversacion)
      .filter((conversacion): conversacion is Conversacion => conversacion !== null)
      .sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn));
  }

  async function crearConversacion(parametros: {
    readonly titulo: string;
    readonly tipo?: TipoConversacion;
  }): Promise<Conversacion> {
    const id = generarUuid();
    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_CONVERSACION,
      sobre: sobreDe({ titulo: parametros.titulo }, TIPO_CONVERSACION, id),
      metadatos: {
        conversation_type: parametros.tipo ?? 'general',
        // Sin referencia mientras no haya envío autorizado. Nunca se deriva
        // del usuario.
        provider_reference_hash: null,
      } satisfies Metadatos,
    });

    const creada = aConversacion(registro);
    if (creada === null) throw new Error('La conversación recién creada no se puede releer');
    return creada;
  }

  async function mensajesDe(conversacionId: string): Promise<readonly Mensaje[]> {
    const registros = await almacen.listar(TIPO_MENSAJE);
    return registros
      .map(aMensaje)
      .filter(
        (mensaje): mensaje is Mensaje =>
          mensaje !== null && mensaje.conversacionId === conversacionId,
      )
      .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
  }

  async function anotarMensaje(parametros: {
    readonly conversacionId: string;
    readonly rol: 'usuario' | 'asistente';
    readonly texto: string;
    readonly categoriaSeguridad?: 'crisis' | null;
  }): Promise<Mensaje> {
    const id = generarUuid();
    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_MENSAJE,
      sobre: sobreDe({ texto: parametros.texto }, TIPO_MENSAJE, id),
      metadatos: {
        conversation_id: parametros.conversacionId,
        role: parametros.rol,
        safety_category: parametros.categoriaSeguridad ?? null,
      } satisfies Metadatos,
    });

    const anotado = aMensaje(registro);
    if (anotado === null) throw new Error('El mensaje recién guardado no se puede releer');
    return anotado;
  }

  /**
   * Borra toda la memoria del asistente.
   *
   * Tiene que funcionar de verdad (Documento 6): se marcan de baja todas las
   * conversaciones **y** todos sus mensajes, no solo la cabecera. Borrar la
   * conversación y dejar los mensajes sería exactamente el tipo de olvido que
   * convierte una promesa de privacidad en una mentira.
   */
  async function borrarMemoria(): Promise<{ readonly borrados: number }> {
    const registros = [
      ...(await almacen.listar(TIPO_MENSAJE)),
      ...(await almacen.listar(TIPO_CONVERSACION)),
    ];

    for (const registro of registros) {
      await motor.registrarEliminacionLocal(registro.tipoEntidad, registro.id);
    }

    return { borrados: registros.length };
  }

  return { conversaciones, crearConversacion, mensajesDe, anotarMensaje, borrarMemoria };
}

export type RepositorioIa = ReturnType<typeof crearRepositorioIa>;
