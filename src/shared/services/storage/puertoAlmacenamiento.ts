// Puertos del almacenamiento de archivos.
//
// Dos, no uno, porque son dos problemas distintos:
//
//   · **El remoto** es el cubo de Supabase. Puede no estar disponible, puede
//     tardar y puede fallar a mitad de una subida.
//
//   · **El local** es el sistema de archivos del teléfono. Es lo que hace que
//     la aplicación sea offline-first de verdad: quien adjunta una foto sin
//     cobertura la tiene guardada al instante, y la subida ocurre después
//     sola (invariante 4).
//
// Ambos manejan **solo bytes cifrados**. Ninguna implementación de estas
// interfaces ve nunca un archivo en claro, y ninguna debe registrar la ruta
// que recibe: `{usuario}/{archivo}` no dice nada por sí sola, pero un
// identificador en un log es un identificador en un log.

/** El cubo remoto. Guarda blobs opacos. */
export interface AlmacenamientoRemoto {
  /**
   * Sube el blob cifrado.
   *
   * Sobrescribe si ya existía: reintentar una subida que se cortó a la mitad
   * tiene que poder terminar el trabajo, no dejar dos copias.
   */
  subir(parametros: { readonly ruta: string; readonly contenido: Uint8Array }): Promise<void>;

  descargar(ruta: string): Promise<Uint8Array>;

  /**
   * Borra el blob. Esto **no** contradice el borrado suave: la papelera vive
   * en `deleted_at` de la ficha, y aquí solo se llega cuando la purga ya
   * decidió que los treinta días pasaron.
   */
  borrar(ruta: string): Promise<void>;
}

/** La copia local del blob cifrado. */
export interface AlmacenamientoLocal {
  escribir(parametros: { readonly ruta: string; readonly contenido: Uint8Array }): Promise<void>;

  /** Devuelve `null` si no está en local; entonces habrá que descargarlo. */
  leer(ruta: string): Promise<Uint8Array | null>;

  borrar(ruta: string): Promise<void>;
}

/**
 * Almacenamiento local en memoria.
 *
 * Sirve para las pruebas y como respaldo si el sistema de archivos no está
 * disponible. **No persiste**: con él, un archivo adjuntado sin conexión se
 * pierde al cerrar la aplicación, así que en el dispositivo se usa siempre la
 * implementación sobre disco.
 */
export function crearAlmacenamientoEnMemoria(): AlmacenamientoLocal {
  const contenidos = new Map<string, Uint8Array>();

  return {
    escribir: async ({ ruta, contenido }) => {
      // Se copia: quien llama es dueño de sus bytes y puede reutilizar el
      // búfer para lo siguiente.
      contenidos.set(ruta, Uint8Array.from(contenido));
    },
    leer: async (ruta) => {
      const contenido = contenidos.get(ruta);
      return contenido === undefined ? null : Uint8Array.from(contenido);
    },
    borrar: async (ruta) => {
      contenidos.delete(ruta);
    },
  };
}
