// Puente entre las pantallas y los casos de uso.
//
// Es el único punto del módulo que conoce React Query, y el único que la
// pantalla llama. Nadie por encima toca el repositorio ni el motor
// (invariante 10).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { BorradorEntrada } from '../models/entradaDiario';
import { crearRepositorioDiario, type RepositorioDiario } from '../repositories/repositorioDiario';
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

export function useEntradasDiario() {
  const repositorio = useRepositorioDiario();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.entradas(usuarioId),
    queryFn: () => listarEntradas(repositorio),
  });
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
