// Conversar con el asistente.
//
// Este caso de uso decide **el orden en que se guardan las cosas**, y ese
// orden no es un detalle:
//
//   1. El mensaje del usuario se guarda **antes** de pedir nada al proveedor.
//      Si la red falla, si la aplicación se cierra o si el proveedor tarda,
//      lo que la persona escribió ya está en su dispositivo. Perder eso sería
//      perder justo lo que le costó escribir (invariante 4).
//   2. La respuesta se guarda después, con su categoría de seguridad si la
//      tiene.
//   3. **Nunca se lanza una excepción que borre el mensaje del usuario.** Si
//      algo va mal, el asistente responde que no puede responder, y la
//      conversación queda coherente.
//
// El servicio de IA se recibe ya construido: aquí no se sabe qué proveedor
// hay detrás ni se puede llamar a ninguno directamente.
import { esErrorApp } from '@shared/errores/erroresApp';
import type { ServicioIa } from '@shared/services/ia/servicioIa';
import type { RespuestaAsistente } from '@shared/services/ia/tipos';

import { tituloDesde, type Conversacion, type Mensaje } from '../models/conversacion';
import type { RepositorioIa } from '../repositories/repositorioIa';

export async function listarConversaciones(
  repositorio: RepositorioIa,
): Promise<readonly Conversacion[]> {
  return repositorio.conversaciones();
}

export async function listarMensajes(
  repositorio: RepositorioIa,
  conversacionId: string,
): Promise<readonly Mensaje[]> {
  return repositorio.mensajesDe(conversacionId);
}

export interface ResultadoEnvio {
  readonly conversacionId: string;
  readonly pregunta: Mensaje;
  readonly respuesta: Mensaje;
}

export interface ParametrosEnvio {
  readonly repositorio: RepositorioIa;
  readonly servicio: ServicioIa;
  /** `null` abre una conversación nueva con el título deducido del mensaje. */
  readonly conversacionId: string | null;
  readonly texto: string;
  /**
   * Respaldo cuando el servicio falla de forma inesperada.
   *
   * No es el mismo texto que «sin conexión»: eso ya lo resuelve el servicio.
   * Este es el último recurso para que la conversación nunca quede con una
   * pregunta sin respuesta.
   */
  readonly textoRespaldo: string;
  /**
   * Qué contestar cuando falta el permiso de envío.
   *
   * Tiene texto propio porque decir «prefiero no responder a eso» cuando lo
   * que falta es un permiso haría creer a la persona que su pregunta estaba
   * mal. No lo estaba.
   */
  readonly textoSinAutorizacion: string;
}

/**
 * Envía un mensaje y deja la conversación completa en local.
 *
 * Devuelve los dos mensajes ya guardados, no los textos: la pantalla pinta lo
 * que está en el dispositivo, nunca un eco de lo que se escribió.
 */
export async function enviarMensaje(parametros: ParametrosEnvio): Promise<ResultadoEnvio> {
  const { repositorio, servicio, texto, textoRespaldo } = parametros;

  const limpio = texto.trim();
  if (limpio.length === 0) throw new Error('No se envía un mensaje vacío');

  const conversacionId =
    parametros.conversacionId ??
    (await repositorio.crearConversacion({ titulo: tituloDesde(limpio) })).id;

  // Primero el mensaje del usuario, siempre.
  const pregunta = await repositorio.anotarMensaje({
    conversacionId,
    rol: 'usuario',
    texto: limpio,
  });

  const previos = await repositorio.mensajesDe(conversacionId);

  let contestacion: RespuestaAsistente;
  try {
    contestacion = await servicio.responder(
      previos.map((mensaje) => ({ rol: mensaje.rol, texto: mensaje.texto })),
    );
  } catch (causa) {
    // La pregunta sigue guardada y la conversación no queda coja.
    const sinPermiso = esErrorApp(causa) && causa.codigo === 'IA_SIN_AUTORIZACION';
    contestacion = {
      texto: sinPermiso ? parametros.textoSinAutorizacion : textoRespaldo,
      origen: 'filtrada',
      categoriaSeguridad: null,
    };
  }

  const respuesta = await repositorio.anotarMensaje({
    conversacionId,
    rol: 'asistente',
    texto: contestacion.texto,
    categoriaSeguridad: contestacion.categoriaSeguridad,
  });

  return { conversacionId, pregunta, respuesta };
}

/**
 * Borra toda la memoria del asistente.
 *
 * El Documento 6 pide que esta opción «sea visible y funcione de verdad».
 * Aquí es una línea porque el repositorio ya se ocupa de retirar mensajes y
 * conversaciones; lo que no puede pasar nunca es que este caso de uso se
 * convierta en un borrado parcial.
 */
export async function borrarMemoria(
  repositorio: RepositorioIa,
): Promise<{ readonly borrados: number }> {
  return repositorio.borrarMemoria();
}
