// Claves públicas de compartición.
//
// Una tabla, dos operaciones y ninguna sorpresa: publicar la propia y leer
// las ajenas. **Aquí nunca hay material privado.** La clave privada se deriva
// de la maestra en el dispositivo y no sale de él; lo que se publica es
// público por definición y sin la privada no abre ningún sobre.
import type { ClienteRest } from './rest';

export interface FilaClaveComparticion {
  readonly user_id: string;
  readonly public_key: string;
}

const COLUMNAS = 'user_id,public_key';

export function crearRepositorioClavesComparticion(rest: ClienteRest) {
  /**
   * Publica la clave pública del usuario.
   *
   * Idempotente: la clave se deriva de la maestra, así que es siempre la
   * misma y republicarla no cambia nada. Se llama al abrir sesión, porque un
   * usuario sin clave publicada no puede recibir nada compartido y no
   * entendería por qué.
   */
  async function publicar(parametros: {
    readonly usuarioId: string;
    readonly publicaBase64: string;
  }): Promise<void> {
    const respuesta = await rest.peticion<FilaClaveComparticion>({
      metodo: 'POST',
      ruta: '/user_sharing_keys?on_conflict=user_id',
      cuerpo: {
        user_id: parametros.usuarioId,
        public_key: parametros.publicaBase64,
        algorithm: 'x25519',
      },
      prefer: 'resolution=merge-duplicates',
    });

    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, 'publicar:user_sharing_keys');
    }
  }

  /**
   * Claves públicas de un conjunto de personas.
   *
   * Devuelve un mapa para que quien comparte pueda distinguir a quién le
   * falta: sin clave publicada no se comparte con esa persona, y eso hay que
   * decirlo, no resolverlo por lo bajo.
   */
  async function publicasDe(usuarioIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (usuarioIds.length === 0) return new Map();

    const respuesta = await rest.peticion<FilaClaveComparticion>({
      metodo: 'GET',
      ruta: `/user_sharing_keys?user_id=in.(${usuarioIds.join(',')})&select=${COLUMNAS}`,
    });

    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, 'leer:user_sharing_keys');
    }

    return new Map(respuesta.filas.map((fila) => [fila.user_id, fila.public_key]));
  }

  return { publicar, publicasDe };
}

export type RepositorioClavesComparticion = ReturnType<typeof crearRepositorioClavesComparticion>;
