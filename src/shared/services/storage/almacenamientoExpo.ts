// Copia local de los archivos cifrados.
//
// Es lo que hace que adjuntar funcione sin cobertura: la foto se cifra y se
// escribe al instante, y la subida ocurre después sola (invariante 4).
//
// El disco de verdad lo toca `sistemaDeArchivosExpo`, que no se puede
// ejecutar fuera de un dispositivo. Aquí queda lo que sí importa probar: qué
// hacer cuando ese disco falla.
import type { AlmacenamientoLocal } from './puertoAlmacenamiento';

/**
 * Sistema de archivos mínimo que hace falta.
 *
 * Existe como interfaz para poder probar la lógica de esta capa sin un módulo
 * nativo. Quien la implemente recibe **siempre bytes cifrados**.
 */
export interface SistemaDeArchivos {
  escribir(ruta: string, contenido: Uint8Array): Promise<void>;
  leer(ruta: string): Promise<Uint8Array | null>;
  borrar(ruta: string): Promise<void>;
}

/**
 * Convierte la ruta lógica en un nombre de archivo plano.
 *
 * `{usuario}/{archivo}` se aplana a `{usuario}_{archivo}`: así no hay que
 * crear una carpeta por usuario ni preocuparse de dejarlas vacías al cerrar
 * sesión. Ambos tramos son UUID, de modo que el guion bajo no puede
 * confundirse con nada de dentro.
 */
export const nombrePlano = (ruta: string): string => ruta.split('/').join('_');

/**
 * Almacenamiento local de archivos.
 *
 * Ninguna operación lanza hacia arriba. Un disco lleno o un permiso denegado
 * no pueden tumbar la pantalla en la que alguien acaba de elegir una foto: se
 * devuelve `null` al leer y se sigue adelante al escribir, y quien llama ya
 * sabe tratar la ausencia —el repositorio marca el archivo como fallido y lo
 * dice.
 *
 * Los errores **no se registran**: llevan la ruta dentro, y una ruta lleva
 * dos identificadores (invariante 2).
 */
export function crearAlmacenamientoDeArchivos(sistema: SistemaDeArchivos): AlmacenamientoLocal {
  return {
    escribir: async ({ ruta, contenido }) => {
      try {
        await sistema.escribir(ruta, contenido);
      } catch {
        // Sin copia local, el archivo se sube en el intento siguiente o se
        // marca fallido. Perder la escritura es malo; perder la pantalla,
        // peor.
      }
    },

    leer: async (ruta) => {
      try {
        return await sistema.leer(ruta);
      } catch {
        return null;
      }
    },

    borrar: async (ruta) => {
      try {
        await sistema.borrar(ruta);
      } catch {
        // Borrar algo que ya no está, o que no se puede borrar, no es motivo
        // para detener una purga que tiene más archivos por delante.
      }
    },
  };
}
