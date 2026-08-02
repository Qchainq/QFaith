// Puente entre las pantallas de Oración y los casos de uso. Único punto del
// módulo que conoce React Query (invariante 10).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { BorradorPeticion, EstadoPeticion } from '../models/peticion';
import {
  crearRepositorioOracion,
  type RepositorioOracion,
} from '../repositories/repositorioOracion';
import {
  anotarAvance,
  archivarPeticion,
  eliminarPeticion,
  guardarPeticion,
  listarAvances,
  listarPeticiones,
  marcarRespondida,
  reactivarPeticion,
} from '../use-cases/gestionPeticiones';

export const clavesConsulta = {
  peticiones: (usuarioId: string) => ['oracion', usuarioId, 'peticiones'] as const,
  avances: (usuarioId: string, peticionId: string) =>
    ['oracion', usuarioId, 'avances', peticionId] as const,
};

export function useRepositorioOracion(): RepositorioOracion {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioOracion({
        motor,
        almacen,
        usuarioId,
        claveOracion: () => claveDeDominio('oracion'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function usePeticiones() {
  const repositorio = useRepositorioOracion();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.peticiones(usuarioId),
    queryFn: () => listarPeticiones(repositorio),
  });
}

export function useAvances(peticionId: string) {
  const repositorio = useRepositorioOracion();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.avances(usuarioId, peticionId),
    queryFn: () => listarAvances(repositorio, peticionId),
  });
}

/** Invalida la lista sin bloquear la mutación a la relectura. */
function useRefrescoDeLista() {
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: clavesConsulta.peticiones(usuarioId) });
  };
}

export function useGuardarPeticion() {
  const repositorio = useRepositorioOracion();
  const refrescar = useRefrescoDeLista();

  return useMutation({
    mutationFn: (borrador: BorradorPeticion) => guardarPeticion(repositorio, borrador),
    onSuccess: refrescar,
  });
}

export function useCambiarEstadoPeticion() {
  const repositorio = useRepositorioOracion();
  const refrescar = useRefrescoDeLista();

  return useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: EstadoPeticion }) => {
      if (estado === 'answered') return marcarRespondida(repositorio, id);
      if (estado === 'archived') return archivarPeticion(repositorio, id);
      return reactivarPeticion(repositorio, id);
    },
    onSuccess: refrescar,
  });
}

export function useEliminarPeticion() {
  const repositorio = useRepositorioOracion();
  const refrescar = useRefrescoDeLista();

  return useMutation({
    mutationFn: (id: string) => eliminarPeticion(repositorio, id),
    onSuccess: refrescar,
  });
}

export function useAnotarAvance() {
  const repositorio = useRepositorioOracion();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (parametros: { peticionId: string; texto: string }) =>
      anotarAvance(repositorio, parametros),
    onSuccess: (_avance, parametros) => {
      void cliente.invalidateQueries({
        queryKey: clavesConsulta.avances(usuarioId, parametros.peticionId),
      });
    },
  });
}
