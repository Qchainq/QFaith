// Puente entre las pantallas de planes y los dos repositorios.
//
// El módulo tiene dos fuentes con vidas distintas y conviene que la caché lo
// refleje: el catálogo cambia cuando QFaith publica algo, y el seguimiento
// cambia cada vez que alguien lee un día. Mezclarlos en una sola clave haría
// que marcar un día recargara el catálogo entero.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';
import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { crearClienteRest } from '@shared/services/supabase/rest';

import {
  crearRepositorioCatalogoPlanes,
  type RepositorioCatalogoPlanes,
} from '../repositories/repositorioCatalogoPlanes';
import {
  crearRepositorioSeguimiento,
  type RepositorioSeguimiento,
} from '../repositories/repositorioSeguimiento';

export const clavesConsulta = {
  catalogo: (idioma: string) => ['planes', 'catalogo', idioma] as const,
  plan: (planId: string) => ['planes', 'catalogo', 'plan', planId] as const,
  dias: (planId: string) => ['planes', 'catalogo', 'dias', planId] as const,
  inscripciones: (usuarioId: string) => ['planes', 'mios', usuarioId] as const,
  progreso: (usuarioId: string, inscripcionId: string) =>
    ['planes', 'mios', usuarioId, inscripcionId] as const,
  leidos: (usuarioId: string) => ['planes', 'mios', usuarioId, 'leidos'] as const,
};

export function useCatalogoPlanes(): RepositorioCatalogoPlanes {
  return useMemo(
    () => crearRepositorioCatalogoPlanes(crearClienteRest({ proveerToken: tokenAcceso })),
    [],
  );
}

export function useRepositorioSeguimiento(): RepositorioSeguimiento {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioSeguimiento({
        motor,
        almacen,
        usuarioId,
        clavePlanes: () => claveDeDominio('planes'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function usePlanesDisponibles(idioma: string) {
  const catalogo = useCatalogoPlanes();

  return useQuery({
    queryKey: clavesConsulta.catalogo(idioma),
    queryFn: () => catalogo.planes(idioma),
    // El catálogo cambia cuando QFaith publica algo, no mientras alguien lo
    // mira. Volver a pedirlo en cada vuelta gastaría datos para nada.
    staleTime: 15 * 60 * 1000,
  });
}

export function useDiasDelPlan(planId: string) {
  const catalogo = useCatalogoPlanes();

  return useQuery({
    queryKey: clavesConsulta.dias(planId),
    queryFn: () => catalogo.dias(planId),
    enabled: planId.length > 0,
    staleTime: 15 * 60 * 1000,
  });
}

export function useMisPlanes() {
  const repositorio = useRepositorioSeguimiento();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.inscripciones(usuarioId),
    queryFn: () => repositorio.inscripciones(),
  });
}

/**
 * Días leídos de cada plan, todos de una vez.
 *
 * Una sola consulta para toda la lista: pedirlo por inscripción sería una
 * consulta por fila en pantalla.
 */
export function useDiasLeidos() {
  const repositorio = useRepositorioSeguimiento();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.leidos(usuarioId),
    queryFn: () => repositorio.leidosPorInscripcion(),
  });
}

export function useProgreso(inscripcionId: string) {
  const repositorio = useRepositorioSeguimiento();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.progreso(usuarioId, inscripcionId),
    queryFn: () => repositorio.diasDe(inscripcionId),
    enabled: inscripcionId.length > 0,
  });
}

export function useEmpezarPlan() {
  const repositorio = useRepositorioSeguimiento();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (planId: string) => repositorio.empezar(planId),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.inscripciones(usuarioId) });
    },
  });
}

export function useCompletarDia() {
  const repositorio = useRepositorioSeguimiento();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (parametros: {
      readonly inscripcionId: string;
      readonly numero: number;
      readonly totalDias: number;
      readonly reflexion?: string;
    }) => repositorio.completarDia(parametros),
    onSuccess: () => {
      // Se invalida la rama entera de lo propio, no el catálogo: marcar un día
      // no cambia lo que QFaith publica.
      void cliente.invalidateQueries({ queryKey: ['planes', 'mios', usuarioId] });
    },
  });
}

export function useCambiarEstadoPlan() {
  const repositorio = useRepositorioSeguimiento();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: async (parametros: {
      readonly inscripcionId: string;
      readonly accion: 'pausar' | 'retomar' | 'abandonar';
    }) => {
      const { inscripcionId, accion } = parametros;
      if (accion === 'pausar') return repositorio.pausar(inscripcionId);
      if (accion === 'retomar') return repositorio.retomar(inscripcionId);
      return repositorio.abandonar(inscripcionId);
    },
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['planes', 'mios', usuarioId] });
    },
  });
}
