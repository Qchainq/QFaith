// Puente entre las pantallas y los casos de uso.
//
// Es el único punto del módulo que conoce React Query, y el único que la
// pantalla llama. Nadie por encima toca el repositorio ni el motor
// (invariante 10).
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { BorradorEntrada, EntradaDiario } from '../models/entradaDiario';
import {
  crearRepositorioDiario,
  type Lectura,
  type RepositorioDiario,
} from '../repositories/repositorioDiario';
import { eliminarEntrada, guardarEntrada, listarEntradas } from '../use-cases/gestionEntradas';

/** Clave de caché. Lleva el usuario dentro: dos cuentas no comparten caché. */
export const clavesConsulta = {
  entradas: (usuarioId: string) => ['diario', usuarioId, 'entradas'] as const,
};

export function useRepositorioDiario(): RepositorioDiario {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioDiario({
        motor,
        almacen,
        usuarioId,
        // Se piden en cada operación en lugar de capturarse: si la sesión se
        // bloquea, la siguiente llamada falla en vez de seguir usando material
        // que ya debería estar fuera de memoria.
        claveDiario: () => claveDeDominio('diario'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

/**
 * La lista del Diario, por páginas.
 *
 * Por páginas y no entera porque cada entrada hay que descifrarla, y con años
 * de escritura eso convierte abrir la pantalla en una espera: la medida está
 * en `rendimiento.medicion.test.ts` y el motivo, en `paginacion.ts`. Se pide
 * la siguiente cuando la persona llega abajo, que es cuando de verdad hace
 * falta.
 */
export function useEntradasDiario() {
  const repositorio = useRepositorioDiario();
  const { usuarioId } = useSincronizacion();

  return useInfiniteQuery({
    queryKey: clavesConsulta.entradas(usuarioId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listarEntradas(repositorio, { desde: pageParam }),
    getNextPageParam: (ultima) => ultima.siguiente,
  });
}

/**
 * Aplana las páginas en lo que la pantalla necesita.
 *
 * Los ilegibles se **suman** entre páginas: quedarse con los de la última
 * haría desaparecer el aviso al seguir bajando, y eso es justo lo que no
 * puede pasar con algo que la persona ha perdido.
 */
export function unirPaginas(paginas: readonly Lectura[]): {
  readonly entradas: readonly EntradaDiario[];
  readonly ilegibles: number;
  readonly total: number;
} {
  return {
    entradas: paginas.flatMap((pagina) => [...pagina.entradas]),
    ilegibles: paginas.reduce((suma, pagina) => suma + pagina.ilegibles, 0),
    total: paginas[0]?.total ?? 0,
  };
}

export function useGuardarEntrada() {
  const repositorio = useRepositorioDiario();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (borrador: BorradorEntrada) => guardarEntrada(repositorio, borrador),
    // La escritura ya está en la base local cuando esto se resuelve, así que
    // basta con releer. La invalidación no se devuelve a propósito: si se
    // devolviera, la mutación quedaría pendiente hasta que terminara la
    // relectura y la pantalla se quedaría en «guardando» sin motivo.
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.entradas(usuarioId) });
    },
  });
}

export function useEliminarEntrada() {
  const repositorio = useRepositorioDiario();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eliminarEntrada(repositorio, id),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.entradas(usuarioId) });
    },
  });
}
