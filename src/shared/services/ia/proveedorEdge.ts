// Proveedor de IA a través de una función Edge de Supabase.
//
// **La clave del modelo nunca vive en el dispositivo.** Una aplicación móvil
// es un binario que cualquiera puede abrir: una clave de proveedor incrustada
// en ella es una clave publicada. Por eso el cliente habla con una función
// propia, autenticada con el token del usuario, y es esa función la que tiene
// la credencial del proveedor.
//
// Esto no rompe el invariante 1. El cifrado de extremo a extremo protege lo
// que QFaith **almacena**: el servidor guarda `encrypted_payload` y no puede
// leerlo. Una conversación con un modelo es distinta por naturaleza —alguien
// tiene que leer la pregunta para poder contestarla—, y por eso hace falta
// autorización explícita del usuario antes de cada envío y solo se manda la
// conversación actual. Lo que se envía se procesa y no se archiva legible.
//
// El proveedor concreto se cambia sustituyendo la función Edge, sin tocar una
// sola línea de la aplicación.
import { configuracion } from '@shared/constants/configuracion';

import type { PeticionProveedor, ProveedorIa, RespuestaProveedor } from './tipos';

export interface OpcionesProveedorEdge {
  /** Token del usuario. Sin sesión no se llama a nada. */
  readonly proveerToken: () => Promise<string | null>;
  /** Inyectable para las pruebas. */
  readonly transporte?: typeof fetch;
  readonly url?: string;
  readonly claveAnonima?: string;
  /**
   * Corte de espera.
   *
   * Un modelo que tarda un minuto deja a alguien mirando «Pensando…» sin
   * saber si va a pasar algo. Es mejor decir que no hubo respuesta.
   */
  readonly tiempoLimiteMs?: number;
}

interface CuerpoRespuesta {
  readonly texto?: unknown;
  readonly referencia?: unknown;
}

export function crearProveedorEdge(opciones: OpcionesProveedorEdge): ProveedorIa {
  const transporte = opciones.transporte ?? fetch;
  const url = opciones.url ?? configuracion.supabase.url;
  const claveAnonima = opciones.claveAnonima ?? configuracion.supabase.claveAnonima;
  const tiempoLimiteMs = opciones.tiempoLimiteMs ?? 30_000;

  async function responder(peticion: PeticionProveedor): Promise<RespuestaProveedor> {
    const token = await opciones.proveerToken();
    if (token === null) throw new Error('No hay sesión para llamar al asistente');

    const corte = new AbortController();
    const temporizador = setTimeout(() => corte.abort(), tiempoLimiteMs);

    let respuesta: Response;
    try {
      respuesta = await transporte(`${url}/functions/v1/asistente`, {
        method: 'POST',
        headers: {
          apikey: claveAnonima,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        // Solo el prompt y la conversación. Nada del diario, de las oraciones
        // ni de ningún otro módulo llega hasta aquí.
        body: JSON.stringify({
          promptSistema: peticion.promptSistema,
          mensajes: peticion.mensajes,
        }),
        signal: corte.signal,
      });
    } finally {
      clearTimeout(temporizador);
    }

    if (!respuesta.ok) {
      // Sin detalle del cuerpo: la respuesta de error de un proveedor suele
      // devolver el texto que provocó el fallo, y eso no puede acabar en un
      // mensaje de error ni en una traza (invariante 2).
      throw new Error(`El asistente respondió ${respuesta.status}`);
    }

    const cuerpo = (await respuesta.json()) as CuerpoRespuesta;
    if (typeof cuerpo.texto !== 'string' || cuerpo.texto.trim().length === 0) {
      throw new Error('El asistente no devolvió texto');
    }

    return {
      texto: cuerpo.texto,
      ...(typeof cuerpo.referencia === 'string' ? { referencia: cuerpo.referencia } : {}),
    };
  }

  return { responder };
}
