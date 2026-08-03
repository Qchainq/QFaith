// Servicio único de IA.
//
// Toda comunicación con un proveedor pasa por aquí (Documento 6). Ningún
// módulo, pantalla ni hook llama a un SDK de LLM, y cambiar de proveedor es
// cambiar la implementación de `ProveedorIa` sin tocar nada más.
//
// El orden de las comprobaciones es lo importante de este archivo:
//
//   1. **Crisis primero, y en local.** Si el mensaje trae señales de riesgo,
//      se responde aquí mismo y **no se llama al proveedor**. La respuesta es
//      siempre la misma, funciona sin conexión y el mensaje no sale del
//      dispositivo para ser clasificado.
//   2. **Consentimiento antes de enviar.** Sin autorización explícita no se
//      manda nada al proveedor.
//   3. **Filtro después de recibir.** Una respuesta que incumple los límites
//      doctrinales se descarta entera.
import { ErrorApp } from '@shared/errores/erroresApp';

import { hayCrisis } from './deteccionCrisis';
import { filtrar } from './filtroRespuesta';
import { PROMPT_SISTEMA } from './promptSistema';
import type { MensajeIa, ProveedorIa, RespuestaAsistente } from './tipos';

export interface OpcionesServicioIa {
  readonly proveedor: ProveedorIa;
  /**
   * Textos de la respuesta ante una crisis y del respaldo, ya traducidos.
   *
   * Se inyectan en lugar de escribirse aquí porque son texto visible y todo
   * texto visible pasa por i18n (invariante 8). Que estén fuera también
   * obliga a que alguien los revise como lo que son: lo más importante que
   * dirá la aplicación.
   */
  readonly textos: {
    readonly crisis: string;
    readonly respaldo: string;
    readonly sinConexion: string;
  };
  /** El usuario autorizó enviar esta conversación al proveedor. */
  readonly autorizadoEnviar: boolean;
}

export function crearServicioIa(opciones: OpcionesServicioIa) {
  /**
   * Responde a un mensaje.
   *
   * `mensajes` es **solo la conversación actual**. Nada del diario, de las
   * oraciones ni del resto del contenido llega aquí salvo que el usuario lo
   * añada él mismo: enviar su vida entera al proveedor «para dar contexto»
   * sería exactamente lo que el invariante 1 impide.
   */
  async function responder(mensajes: readonly MensajeIa[]): Promise<RespuestaAsistente> {
    const ultimo = mensajes[mensajes.length - 1];

    if (ultimo !== undefined && ultimo.rol === 'usuario' && hayCrisis(ultimo.texto)) {
      // Ni se llama al proveedor ni se le envía el texto. La respuesta es
      // determinista a propósito.
      return {
        texto: opciones.textos.crisis,
        origen: 'crisis',
        categoriaSeguridad: 'crisis',
      };
    }

    if (!opciones.autorizadoEnviar) {
      throw new ErrorApp({
        codigo: 'IA_SIN_AUTORIZACION',
        categoria: 'permisos',
        claveMensaje: 'ia.errores.sinAutorizacion',
        puedeReintentarse: false,
      });
    }

    let respuesta;
    try {
      respuesta = await opciones.proveedor.responder({
        promptSistema: PROMPT_SISTEMA,
        mensajes,
      });
    } catch {
      // Sin conexión o proveedor caído. Se avisa y no se bloquea nada más de
      // la aplicación (Documento 6).
      return {
        texto: opciones.textos.sinConexion,
        origen: 'sinConexion',
        categoriaSeguridad: null,
      };
    }

    // Una respuesta puede traer señales de crisis aunque el mensaje no las
    // tuviera: si el modelo lleva la conversación ahí, se corta igual.
    if (hayCrisis(respuesta.texto)) {
      return { texto: opciones.textos.crisis, origen: 'crisis', categoriaSeguridad: 'crisis' };
    }

    if (!filtrar(respuesta.texto).aceptada) {
      // Se descarta entera, no se recorta: el razonamiento que llevó a la
      // frase prohibida sigue estando en el resto del texto.
      return { texto: opciones.textos.respaldo, origen: 'filtrada', categoriaSeguridad: null };
    }

    return { texto: respuesta.texto, origen: 'proveedor', categoriaSeguridad: null };
  }

  return { responder };
}

export type ServicioIa = ReturnType<typeof crearServicioIa>;
