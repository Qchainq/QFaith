// Adaptador de plataforma sobre `expo-file-system`. Es el que corre en el
// dispositivo.
//
// Aquí no hay lógica: solo la traducción entre el puerto y la API de la
// librería. El manejo de errores y la política de qué hacer cuando el disco
// falla viven en `almacenamientoExpo`, que sí se prueba. Es la misma división
// que entre `ejecutorExpo` y `almacenSqlite`, y por el mismo motivo: esto no
// se puede ejecutar fuera de un dispositivo.
//
// Los archivos van al directorio de **documentos** y no al de caché a
// propósito. La caché la puede vaciar el sistema cuando le falte espacio, y
// con ella se iría el único ejemplar de un archivo que todavía no ha llegado
// al servidor.
//
// Lo que se escribe está cifrado, siempre. Un teléfono se pierde, se presta y
// se repara, y el directorio de documentos de una aplicación no es un lugar
// secreto.
import { Directory, File, Paths } from 'expo-file-system';

import { nombrePlano, type SistemaDeArchivos } from './almacenamientoExpo';

const CARPETA = 'archivos-privados';

export function crearSistemaDeArchivosExpo(): SistemaDeArchivos {
  const carpeta = new Directory(Paths.document, CARPETA);

  const asegurarCarpeta = (): void => {
    if (!carpeta.exists) carpeta.create({ intermediates: true });
  };

  return {
    escribir: async (ruta, contenido) => {
      asegurarCarpeta();
      const archivo = new File(carpeta, nombrePlano(ruta));
      // Sobrescribe si ya estaba: reintentar debe terminar el trabajo, no
      // fallar por encontrarse lo de la vez anterior.
      if (archivo.exists) archivo.delete();
      archivo.create();
      archivo.write(contenido);
    },

    leer: async (ruta) => {
      const archivo = new File(carpeta, nombrePlano(ruta));
      // Que no esté es normal: puede venir de otro dispositivo y no haberse
      // descargado todavía.
      if (!archivo.exists) return null;
      return archivo.bytes();
    },

    borrar: async (ruta) => {
      const archivo = new File(carpeta, nombrePlano(ruta));
      if (archivo.exists) archivo.delete();
    },
  };
}
