// Puente entre las pantallas del Memorial y los casos de uso.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { BorradorMemorial } from '../models/memorial';
import {
  crearRepositorioMemorial,
  type RepositorioMemorial,
} from '../repositories/repositorioMemorial';
import {
  alternarFavorito,
  eliminarMemorial,
  guardarMemorial,
  listarMemoriales,
} from '../use-cases/gestionMemoriales';

export const clavesConsulta = {
  memoriales: (usuarioId: string) => ['memorial', usuarioId, 'lista'] as const,
};

export function useRepositorioMemorial(): RepositorioMemorial {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioMemorial({
        motor,
        almacen,
        usuarioId,
        claveMemorial: () => claveDeDominio('memorial'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function useMemoriales() {
  const repositorio = useRepositorioMemorial();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.memoriales(usuarioId),
    queryFn: () => listarMemoriales(repositorio),
  });
}

function useRefrescoDeMemorial() {
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['memorial', usuarioId] });
  };
}

export function useGuardarMemorial() {
  const repositorio = useRepositorioMemorial();
  const refrescar = useRefrescoDeMemorial();

  return useMutation({
    mutationFn: (borrador: BorradorMemorial) => guardarMemorial(repositorio, borrador),
    onSuccess: refrescar,
  });
}

export function useAlternarFavorito() {
  const repositorio = useRepositorioMemorial();
  const refrescar = useRefrescoDeMemorial();

  return useMutation({
    mutationFn: (id: string) => alternarFavorito(repositorio, id),
    onSuccess: refrescar,
  });
}

export function useEliminarMemorial() {
  const repositorio = useRepositorioMemorial();
  const refrescar = useRefrescoDeMemorial();

  return useMutation({
    mutationFn: (id: string) => eliminarMemorial(repositorio, id),
    onSuccess: refrescar,
  });
}
