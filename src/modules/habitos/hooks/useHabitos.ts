// Puente entre las pantallas de Hábitos y los casos de uso.
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { BorradorHabito } from '../models/habito';
import {
  crearRepositorioHabitos,
  type RepositorioHabitos,
} from '../repositories/repositorioHabitos';
import {
  alternarHoy,
  eliminarHabito,
  guardarHabito,
  listarHabitos,
  resumirHabito,
} from '../use-cases/gestionHabitos';

export const clavesConsulta = {
  habitos: (usuarioId: string) => ['habitos', usuarioId, 'lista'] as const,
  resumen: (usuarioId: string, habitoId: string) =>
    ['habitos', usuarioId, 'resumen', habitoId] as const,
};

export function useRepositorioHabitos(): RepositorioHabitos {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioHabitos({
        motor,
        almacen,
        usuarioId,
        claveHabito: () => claveDeDominio('habito'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function useHabitos() {
  const repositorio = useRepositorioHabitos();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.habitos(usuarioId),
    queryFn: () => listarHabitos(repositorio),
  });
}

/** Resumen de cada hábito. Siempre en positivo: días cumplidos, nunca fallados. */
export function useResumenes(habitoIds: readonly string[]) {
  const repositorio = useRepositorioHabitos();
  const { usuarioId } = useSincronizacion();

  return useQueries({
    queries: habitoIds.map((habitoId) => ({
      queryKey: clavesConsulta.resumen(usuarioId, habitoId),
      queryFn: () => resumirHabito(repositorio, { habitoId }),
    })),
  });
}

function useRefresco() {
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['habitos', usuarioId] });
  };
}

export function useGuardarHabito() {
  const repositorio = useRepositorioHabitos();
  const refrescar = useRefresco();

  return useMutation({
    mutationFn: (borrador: BorradorHabito) => guardarHabito(repositorio, borrador),
    onSuccess: refrescar,
  });
}

export function useAlternarHoy() {
  const repositorio = useRepositorioHabitos();
  const refrescar = useRefresco();

  return useMutation({
    mutationFn: (habitoId: string) => alternarHoy(repositorio, { habitoId }),
    onSuccess: refrescar,
  });
}

export function useEliminarHabito() {
  const repositorio = useRepositorioHabitos();
  const refrescar = useRefresco();

  return useMutation({
    mutationFn: (id: string) => eliminarHabito(repositorio, id),
    onSuccess: refrescar,
  });
}
