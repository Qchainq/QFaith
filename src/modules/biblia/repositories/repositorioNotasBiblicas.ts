// Repositorio de notas bíblicas. **Contenido privado, cifrado.**
//
// La otra mitad del módulo. Aquí sí interviene el motor de sincronización,
// igual que en el diario o las oraciones: es contenido de la persona.
//
// La referencia (libro, capítulo, versículos) queda fuera del sobre. Es un
// compromiso consciente y anotado: permite mostrar la nota junto a su pasaje
// sin descargar y descifrar todas las notas, a cambio de revelar qué pasajes
// le interesan. Lo que piensa de ellos sigue siendo ilegible.
import type { AlmacenLocal, Metadatos, RegistroLocal } from '@shared/database/tipos';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import { cifrar, descifrar } from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, VinculoRegistro } from '@shared/services/crypto/tipos';
import type { MotorSincronizacion } from '@shared/services/sync/motorSincronizacion';

import { esquemaContenidoNota, type BorradorNota, type NotaBiblica } from '../models/biblia';

export const TIPO_NOTA = 'bible_notes';

export interface DependenciasRepositorioNotas {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  readonly claveNotas: () => ClaveContenido;
  readonly claveHash: () => Uint8Array;
}

export interface LecturaNotas {
  readonly notas: readonly NotaBiblica[];
  readonly ilegibles: number;
}

const numeroONulo = (valor: unknown): number | null => (typeof valor === 'number' ? valor : null);

export function crearRepositorioNotasBiblicas(dependencias: DependenciasRepositorioNotas) {
  const { motor, almacen, usuarioId } = dependencias;

  const vinculo = (entidadId: string): VinculoRegistro => ({
    usuarioId,
    tipoEntidad: TIPO_NOTA,
    entidadId,
  });

  function aNota(registro: RegistroLocal): NotaBiblica | null {
    let contenido;
    try {
      contenido = esquemaContenidoNota.parse(
        JSON.parse(
          descifrar({
            sobre: registro.sobre,
            clave: dependencias.claveNotas(),
            vinculo: vinculo(registro.id),
          }),
        ),
      );
    } catch {
      return null;
    }

    const libro = registro.metadatos.book_code;
    const capitulo = registro.metadatos.chapter_number;
    if (typeof libro !== 'string' || typeof capitulo !== 'number') {
      return null;
    }

    return {
      id: registro.id,
      ...contenido,
      libro,
      capitulo,
      versiculoInicio: numeroONulo(registro.metadatos.verse_start),
      versiculoFin: numeroONulo(registro.metadatos.verse_end),
      traduccionId:
        typeof registro.metadatos.translation_id === 'string'
          ? registro.metadatos.translation_id
          : null,
      creadaEn: registro.creadoEn,
      actualizadaEn: registro.actualizadoEn,
    };
  }

  function metadatosDe(borrador: BorradorNota): Metadatos {
    return {
      translation_id: borrador.traduccionId ?? null,
      book_code: borrador.libro,
      chapter_number: borrador.capitulo,
      verse_start: borrador.versiculoInicio,
      verse_end: borrador.versiculoFin,
    };
  }

  async function listar(): Promise<LecturaNotas> {
    const registros = await almacen.listar(TIPO_NOTA);
    const notas: NotaBiblica[] = [];
    let ilegibles = 0;

    for (const registro of registros) {
      const nota = aNota(registro);
      if (nota === null) ilegibles += 1;
      else notas.push(nota);
    }

    notas.sort((a, b) => b.actualizadaEn.localeCompare(a.actualizadaEn));
    return { notas, ilegibles };
  }

  /** Notas de un capítulo concreto, para mostrarlas junto al texto. */
  async function delCapitulo(libro: string, capitulo: number): Promise<readonly NotaBiblica[]> {
    const { notas } = await listar();
    return notas.filter((nota) => nota.libro === libro && nota.capitulo === capitulo);
  }

  async function guardar(borrador: BorradorNota): Promise<NotaBiblica> {
    const id = borrador.id ?? generarUuid();
    const contenido = esquemaContenidoNota.parse({ texto: borrador.texto });

    const registro = await motor.registrarCambioLocal({
      id,
      tipoEntidad: TIPO_NOTA,
      sobre: cifrar({
        contenido: JSON.stringify(contenido),
        clave: dependencias.claveNotas(),
        claveHash: dependencias.claveHash(),
        vinculo: vinculo(id),
      }),
      metadatos: metadatosDe(borrador),
    });

    const guardada = aNota(registro);
    if (guardada === null) {
      throw new Error('La nota recién guardada no se puede releer');
    }
    return guardada;
  }

  async function eliminar(id: string): Promise<void> {
    await motor.registrarEliminacionLocal(TIPO_NOTA, id);
  }

  return { listar, delCapitulo, guardar, eliminar };
}

export type RepositorioNotasBiblicas = ReturnType<typeof crearRepositorioNotasBiblicas>;
