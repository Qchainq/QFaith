// Acceso a PostgREST.
//
// Se habla por HTTP en lugar de usar el constructor de consultas del SDK
// porque la sincronización necesita dos cosas que ahí quedan escondidas: la
// cabecera `Prefer` exacta y los filtros de versión que implementan el
// control de concurrencia optimista. Un `update` que se olvide del filtro
// `version=eq.N` pisa el trabajo de otro dispositivo en silencio, que es
// justo lo que el invariante 5 prohíbe.
import { configuracion } from '@shared/constants/configuracion';
import { ErrorApp } from '@shared/errores/erroresApp';

/**
 * `fetch` inyectable. Las pruebas pasan el suyo; en el dispositivo se usa el
 * global.
 */
export type Transporte = typeof fetch;

export interface OpcionesRest {
  readonly transporte?: Transporte;
  /** Devuelve el token del usuario, o null si no hay sesión. */
  readonly proveerToken: () => Promise<string | null>;
  readonly url?: string;
  readonly claveAnonima?: string;
}

export interface RespuestaRest<T> {
  readonly estado: number;
  readonly filas: readonly T[];
  /** Código de PostgREST cuando la respuesta es un error. */
  readonly codigo: string | null;
}

interface CuerpoError {
  readonly code?: string;
}

/**
 * Errores que merece la pena reintentar: cortes de red y fallos temporales
 * del servidor. Un 4xx significa que la petición está mal y reintentarla
 * daría lo mismo.
 */
function esReintentable(estado: number): boolean {
  return estado === 0 || estado === 408 || estado === 429 || estado >= 500;
}

export function crearClienteRest(opciones: OpcionesRest) {
  const transporte = opciones.transporte ?? fetch;
  const url = opciones.url ?? configuracion.supabase.url;
  const claveAnonima = opciones.claveAnonima ?? configuracion.supabase.claveAnonima;

  async function peticion<T>(parametros: {
    readonly metodo: 'GET' | 'POST' | 'PATCH';
    readonly ruta: string;
    readonly cuerpo?: unknown;
    readonly prefer?: string;
  }): Promise<RespuestaRest<T>> {
    const token = await opciones.proveerToken();
    if (token === null) {
      throw new ErrorApp({
        codigo: 'SIN_SESION',
        categoria: 'autenticacion',
        claveMensaje: 'errores.autenticacion',
        puedeReintentarse: false,
      });
    }

    let respuesta: Response;
    try {
      respuesta = await transporte(`${url}/rest/v1${parametros.ruta}`, {
        method: parametros.metodo,
        headers: {
          apikey: claveAnonima,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(parametros.prefer === undefined ? {} : { Prefer: parametros.prefer }),
        },
        ...(parametros.cuerpo === undefined ? {} : { body: JSON.stringify(parametros.cuerpo) }),
      });
    } catch (causa) {
      // Sin red. No es un error del usuario ni algo que deba interrumpirle:
      // el motor lo reintentará (invariante 4).
      throw new ErrorApp(
        {
          codigo: 'RED_NO_DISPONIBLE',
          categoria: 'conectividad',
          claveMensaje: 'errores.sinConexion',
          puedeReintentarse: true,
        },
        causa,
      );
    }

    const texto = await respuesta.text();
    let cuerpo: unknown = null;
    if (texto.length > 0) {
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        cuerpo = null;
      }
    }

    if (respuesta.status >= 400) {
      const codigo = (cuerpo as CuerpoError | null)?.code ?? null;
      return { estado: respuesta.status, filas: [], codigo };
    }

    return {
      estado: respuesta.status,
      filas: Array.isArray(cuerpo) ? (cuerpo as T[]) : [],
      codigo: null,
    };
  }

  /**
   * Convierte una respuesta de error en `ErrorApp`.
   *
   * El contexto lleva solo el código HTTP y el de PostgREST. Nunca el cuerpo:
   * puede contener metadatos del usuario y no tiene por qué acabar en un log
   * (invariante 2).
   */
  function comoError(respuesta: RespuestaRest<unknown>, operacion: string): ErrorApp {
    const categoria =
      respuesta.estado === 401 || respuesta.estado === 403 ? 'autenticacion' : 'servidor';
    return new ErrorApp({
      codigo: `REST_${respuesta.estado}`,
      categoria,
      claveMensaje: categoria === 'autenticacion' ? 'errores.autenticacion' : 'errores.servidor',
      puedeReintentarse: esReintentable(respuesta.estado),
      contexto: {
        operacion,
        estado: respuesta.estado,
        ...(respuesta.codigo === null ? {} : { codigoPostgrest: respuesta.codigo }),
      },
    });
  }

  return { peticion, comoError };
}

export type ClienteRest = ReturnType<typeof crearClienteRest>;
