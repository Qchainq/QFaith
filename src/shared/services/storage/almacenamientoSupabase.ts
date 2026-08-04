// El cubo de Supabase Storage.
//
// Se habla por HTTP y no con el SDK por el mismo motivo que en `rest.ts`: hay
// cabeceras que aquí importan y que el constructor del SDK esconde. En
// concreto `x-upsert`, sin la cual reintentar una subida cortada devuelve un
// conflicto en lugar de terminar el trabajo.
//
// Lo que sube es un blob cifrado y se declara como `application/octet-stream`.
// Decir «image/jpeg» sería mentira —el criptograma no es un JPEG— y además
// invitaría a Storage a intentar servirlo como imagen.
//
// Nunca se generan URLs públicas. El acceso va con el token del usuario y las
// políticas del cubo, que la migración 0016 comprueba.
import { configuracion } from '@shared/constants/configuracion';
import { ErrorApp } from '@shared/errores/erroresApp';

import type { AlmacenamientoRemoto } from './puertoAlmacenamiento';

export const CUBO_ARCHIVOS = 'archivos-privados';

export interface OpcionesAlmacenamiento {
  readonly transporte?: typeof fetch;
  readonly proveerToken: () => Promise<string | null>;
  readonly url?: string;
  readonly claveAnonima?: string;
  readonly cubo?: string;
}

function esReintentable(estado: number): boolean {
  return estado === 0 || estado === 408 || estado === 429 || estado >= 500;
}

/**
 * Error de almacenamiento.
 *
 * El contexto lleva la operación y el estado, **nunca la ruta**: contiene el
 * identificador del usuario y el del archivo, y el contexto de un `ErrorApp`
 * acaba en telemetría (invariante 2).
 */
function errorAlmacenamiento(operacion: string, estado: number): ErrorApp {
  return new ErrorApp({
    codigo: estado === 404 ? 'ARCHIVO_NO_ENCONTRADO' : 'ALMACENAMIENTO_FALLIDO',
    categoria: estado === 0 ? 'conectividad' : 'servidor',
    claveMensaje: estado === 0 ? 'errores.sinConexion' : 'errores.archivos.almacenamiento',
    puedeReintentarse: esReintentable(estado),
    contexto: { operacion, estado },
  });
}

export function crearAlmacenamientoSupabase(
  opciones: OpcionesAlmacenamiento,
): AlmacenamientoRemoto {
  const transporte = opciones.transporte ?? fetch;
  const url = opciones.url ?? configuracion.supabase.url;
  const claveAnonima = opciones.claveAnonima ?? configuracion.supabase.claveAnonima;
  const cubo = opciones.cubo ?? CUBO_ARCHIVOS;

  async function cabeceras(): Promise<Record<string, string>> {
    const token = await opciones.proveerToken();
    return {
      apikey: claveAnonima,
      // Sin sesión se manda la clave anónima como portador: la política del
      // cubo responderá que no, que es exactamente lo que debe pasar.
      Authorization: `Bearer ${token ?? claveAnonima}`,
    };
  }

  /**
   * Cada segmento se escapa por separado.
   *
   * `encodeURIComponent` sobre la ruta entera convertiría las barras en
   * `%2F` y el archivo acabaría en un objeto con barras en el nombre, fuera
   * de la carpeta del usuario. Ahí la política del cubo ya no protege nada.
   */
  const rutaEscapada = (ruta: string): string => ruta.split('/').map(encodeURIComponent).join('/');

  const destino = (ruta: string): string =>
    `${url}/storage/v1/object/${cubo}/${rutaEscapada(ruta)}`;

  async function intentar(operacion: string, peticion: () => Promise<Response>): Promise<Response> {
    let respuesta: Response;
    try {
      respuesta = await peticion();
    } catch (causa) {
      throw new ErrorApp(
        {
          codigo: 'RED_NO_DISPONIBLE',
          categoria: 'conectividad',
          claveMensaje: 'errores.sinConexion',
          puedeReintentarse: true,
          contexto: { operacion },
        },
        causa,
      );
    }
    if (respuesta.status >= 400) throw errorAlmacenamiento(operacion, respuesta.status);
    return respuesta;
  }

  return {
    subir: async ({ ruta, contenido }) => {
      await intentar('subir:archivo', async () =>
        transporte(destino(ruta), {
          method: 'POST',
          headers: {
            ...(await cabeceras()),
            'Content-Type': 'application/octet-stream',
            // Reintentar una subida cortada debe terminarla, no chocar.
            'x-upsert': 'true',
          },
          body: contenido as BodyInit,
        }),
      );
    },

    descargar: async (ruta) => {
      const respuesta = await intentar('descargar:archivo', async () =>
        transporte(destino(ruta), { method: 'GET', headers: await cabeceras() }),
      );
      return new Uint8Array(await respuesta.arrayBuffer());
    },

    borrar: async (ruta) => {
      await intentar('borrar:archivo', async () =>
        transporte(destino(ruta), { method: 'DELETE', headers: await cabeceras() }),
      );
    },
  };
}
