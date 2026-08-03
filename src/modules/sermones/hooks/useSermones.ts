// Puente entre las pantallas de Sermones y los casos de uso.
//
// Dos orígenes distintos, a propósito: el sermón viene de PostgREST a través
// del repositorio de Iglesia, y las notas del motor de sincronización. Se
// juntan solo al pintar.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useMisIglesias, useRepositorioIglesia } from '@modules/iglesia/hooks/useIglesia';
import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';
import type { RepositorioIglesia } from '@shared/services/supabase/repositorioIglesia';

import type { BorradorAccion, BorradorNota } from '../models/sermon';
import {
  crearRepositorioSermones,
  type RepositorioSermones,
} from '../repositories/repositorioNotasSermon';
import {
  alternarHecha,
  eliminarNota,
  guardarAccion,
  guardarNota,
  listarAcciones,
  listarNotas,
  sermonesDe,
} from '../use-cases/gestionSermones';

export const clavesConsulta = {
  notas: (usuarioId: string) => ['sermones', usuarioId, 'notas'] as const,
  acciones: (usuarioId: string) => ['sermones', usuarioId, 'acciones'] as const,
  publicados: (usuarioId: string, iglesiaId: string) =>
    ['sermones', usuarioId, 'publicados', iglesiaId] as const,
};

export function useRepositorioSermones(): RepositorioSermones {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioSermones({
        motor,
        almacen,
        usuarioId,
        claveSermon: () => claveDeDominio('notaSermon'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function useNotas() {
  const repositorio = useRepositorioSermones();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.notas(usuarioId),
    queryFn: () => listarNotas(repositorio),
  });
}

export function useAcciones() {
  const repositorio = useRepositorioSermones();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.acciones(usuarioId),
    queryFn: () => listarAcciones(repositorio),
  });
}

/**
 * Sermones publicados por la iglesia activa.
 *
 * Sin iglesia no hay sermones institucionales, y eso no es un error: el
 * módulo sigue sirviendo para tomar notas sueltas.
 */
export function useSermonesPublicados(repositorioIglesia?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorioIglesia);
  const { usuarioId } = useSincronizacion();
  const mias = useMisIglesias(repositorioIglesia);
  const iglesiaId =
    (mias.data ?? []).find((entrada) => entrada.membresia.estado === 'active')?.iglesia.id ?? null;

  return useQuery({
    queryKey: clavesConsulta.publicados(usuarioId, iglesiaId ?? 'ninguna'),
    queryFn: () => (iglesiaId === null ? [] : sermonesDe(repo, iglesiaId)),
  });
}

function useRefrescoDeSermones() {
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['sermones', usuarioId] });
  };
}

export function useGuardarNota() {
  const repositorio = useRepositorioSermones();
  const refrescar = useRefrescoDeSermones();

  return useMutation({
    mutationFn: (borrador: BorradorNota) => guardarNota(repositorio, borrador),
    onSuccess: refrescar,
  });
}

export function useEliminarNota() {
  const repositorio = useRepositorioSermones();
  const refrescar = useRefrescoDeSermones();

  return useMutation({
    mutationFn: (id: string) => eliminarNota(repositorio, id),
    onSuccess: refrescar,
  });
}

export function useGuardarAccion() {
  const repositorio = useRepositorioSermones();
  const refrescar = useRefrescoDeSermones();

  return useMutation({
    mutationFn: (borrador: BorradorAccion) => guardarAccion(repositorio, borrador),
    onSuccess: refrescar,
  });
}

export function useAlternarHecha() {
  const repositorio = useRepositorioSermones();
  const refrescar = useRefrescoDeSermones();

  return useMutation({
    mutationFn: (id: string) => alternarHecha(repositorio, id),
    onSuccess: refrescar,
  });
}
