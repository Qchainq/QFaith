// Repositorio del texto bíblico. **Contenido público, sin cifrar.**
//
// Es el primero del proyecto que no pasa por el motor de sincronización, y
// tiene su motivo: el motor existe para propagar los cambios de una persona
// entre sus dispositivos, con control de versión y resolución de conflictos.
// Aquí no hay nada de eso. El texto es el mismo para todo el mundo, nadie lo
// edita desde la aplicación y no tiene dueño.
//
// Se lee directamente de PostgREST y se cachea. El Documento 9 lo permite
// expresamente para contenido público, y solo para él.
import type { ClienteRest } from '@shared/services/supabase/rest';

import type { Libro, Traduccion, Versiculo } from '../models/biblia';

interface FilaTraduccion {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly language_code: string;
  readonly offline_available: boolean;
}

interface FilaLibro {
  readonly book_code: string;
  readonly book_name: string;
  readonly testament: string;
  readonly book_order: number;
  readonly chapter_count: number;
}

interface FilaVersiculo {
  readonly book_code: string;
  readonly chapter_number: number;
  readonly verse_number: number;
  readonly verse_text: string;
}

export interface DependenciasRepositorioBiblia {
  readonly rest: ClienteRest;
}

export function crearRepositorioBiblia({ rest }: DependenciasRepositorioBiblia) {
  async function traducciones(idioma?: string): Promise<readonly Traduccion[]> {
    const filtroIdioma = idioma === undefined ? '' : `&language_code=eq.${idioma}`;
    const respuesta = await rest.peticion<FilaTraduccion>({
      metodo: 'GET',
      ruta:
        '/bible_translations?is_active=eq.true' +
        `${filtroIdioma}&select=id,code,name,language_code,offline_available&order=name.asc`,
    });
    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, 'leer:bible_translations');
    }
    return respuesta.filas.map((fila) => ({
      id: fila.id,
      codigo: fila.code,
      nombre: fila.name,
      idioma: fila.language_code,
      disponibleSinConexion: fila.offline_available,
    }));
  }

  async function libros(traduccionId: string): Promise<readonly Libro[]> {
    const respuesta = await rest.peticion<FilaLibro>({
      metodo: 'GET',
      ruta:
        `/bible_books?translation_id=eq.${encodeURIComponent(traduccionId)}` +
        '&select=book_code,book_name,testament,book_order,chapter_count&order=book_order.asc',
    });
    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, 'leer:bible_books');
    }
    return respuesta.filas.map((fila) => ({
      codigo: fila.book_code,
      nombre: fila.book_name,
      testamento: fila.testament === 'nuevo' ? 'nuevo' : 'antiguo',
      orden: fila.book_order,
      capitulos: fila.chapter_count,
    }));
  }

  async function capitulo(parametros: {
    readonly traduccionId: string;
    readonly libro: string;
    readonly capitulo: number;
  }): Promise<readonly Versiculo[]> {
    const respuesta = await rest.peticion<FilaVersiculo>({
      metodo: 'GET',
      ruta:
        `/bible_verses?translation_id=eq.${encodeURIComponent(parametros.traduccionId)}` +
        `&book_code=eq.${encodeURIComponent(parametros.libro)}` +
        `&chapter_number=eq.${parametros.capitulo}` +
        '&select=book_code,chapter_number,verse_number,verse_text&order=verse_number.asc',
    });
    if (respuesta.estado >= 400) {
      throw rest.comoError(respuesta, 'leer:bible_verses');
    }
    return respuesta.filas.map((fila) => ({
      libro: fila.book_code,
      capitulo: fila.chapter_number,
      numero: fila.verse_number,
      texto: fila.verse_text,
    }));
  }

  return { traducciones, libros, capitulo };
}

export type RepositorioBiblia = ReturnType<typeof crearRepositorioBiblia>;
