// Organización de la Biblioteca de Vida.
//
// Recoge lo que publican los demás módulos, lo clasifica en el dispositivo y
// guarda una ficha por registro de origen. Dos reglas mandan:
//
//   1. **No se duplica contenido.** Se guarda un resumen corto y los temas,
//      nunca el texto completo. El original vive en su módulo.
//   2. **Reclasificar actualiza, no acumula.** El identificador de la ficha
//      se deriva del origen, así que pasar el organizador dos veces deja el
//      mismo número de elementos.
import { generarUuidDesde } from '@shared/services/crypto/aleatoriedad';

import {
  resumir,
  type Aportacion,
  type ElementoBiblioteca,
  type FuenteBiblioteca,
} from '../models/biblioteca';
import type {
  LecturaBiblioteca,
  RepositorioBiblioteca,
} from '../repositories/repositorioBiblioteca';
import { clasificar } from './clasificador';

export async function listarBiblioteca(
  repositorio: RepositorioBiblioteca,
): Promise<LecturaBiblioteca> {
  return repositorio.listar();
}

/** Identificador estable de la ficha de un registro. */
export function identificadorDeFicha(origen: string, origenId: string): string {
  return generarUuidDesde(`biblioteca/${origen}/${origenId}`);
}

export interface ResumenOrganizacion {
  readonly registrados: number;
  readonly retirados: number;
}

/**
 * Pasa el organizador sobre todas las fuentes.
 *
 * Las fichas cuyo registro de origen ya no aparece se retiran: si alguien
 * borró una entrada del diario, su rastro en la Biblioteca tiene que
 * desaparecer también. Dejarlo sería una copia del contenido por la puerta de
 * atrás.
 */
export async function organizar(
  repositorio: RepositorioBiblioteca,
  fuentes: readonly FuenteBiblioteca[],
): Promise<ResumenOrganizacion> {
  const aportaciones: Aportacion[] = [];
  for (const fuente of fuentes) {
    aportaciones.push(...(await fuente.aportaciones()));
  }

  const vigentes = new Set<string>();
  for (const aportacion of aportaciones) {
    const id = identificadorDeFicha(aportacion.origen, aportacion.origenId);
    vigentes.add(id);

    await repositorio.registrar({
      id,
      origen: aportacion.origen,
      origenId: aportacion.origenId,
      ocurridoEn: aportacion.ocurridoEn,
      contenido: {
        titulo: aportacion.titulo.slice(0, 200),
        // Un resumen corto, no el texto: la Biblioteca organiza, no copia.
        resumen: resumir(aportacion.texto),
        temas: [...clasificar(`${aportacion.titulo} ${aportacion.texto}`)],
      },
    });
  }

  const { elementos } = await repositorio.listar();
  const huerfanos = elementos.filter((elemento) => !vigentes.has(elemento.id));
  for (const huerfano of huerfanos) {
    await repositorio.retirar(huerfano.id);
  }

  return { registrados: aportaciones.length, retirados: huerfanos.length };
}

/** Filtra por tema. Sin tema devuelve todo, en su orden cronológico. */
export function filtrarPorTema(
  elementos: readonly ElementoBiblioteca[],
  tema: string | null,
): readonly ElementoBiblioteca[] {
  if (tema === null) return elementos;
  return elementos.filter((elemento) => (elemento.temas as readonly string[]).includes(tema));
}
