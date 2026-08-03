// Puente entre las pantallas de Iglesia y los casos de uso.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { crearClienteRest } from '@shared/services/supabase/rest';
import {
  crearRepositorioIglesia,
  type RepositorioIglesia,
} from '@shared/services/supabase/repositorioIglesia';
import { useEstadoSesion } from '@shared/state/estadoSesion';

import {
  abandonarIglesia,
  alternarInscripcion,
  buscarIglesia,
  eventosDe,
  gruposDe,
  misIglesias,
  misMentorias,
  solicitarIngreso,
  terminarMentoria,
} from '../use-cases/gestionIglesia';

export const clavesConsulta = {
  mias: (usuarioId: string) => ['iglesia', usuarioId, 'mias'] as const,
  grupos: (usuarioId: string, iglesiaId: string) =>
    ['iglesia', usuarioId, 'grupos', iglesiaId] as const,
  eventos: (usuarioId: string, iglesiaId: string) =>
    ['iglesia', usuarioId, 'eventos', iglesiaId] as const,
  mentorias: (usuarioId: string) => ['iglesia', usuarioId, 'mentorias'] as const,
};

export function useRepositorioIglesia(repositorio?: RepositorioIglesia): RepositorioIglesia {
  return useMemo(
    () => repositorio ?? crearRepositorioIglesia(crearClienteRest({ proveerToken: tokenAcceso })),
    [repositorio],
  );
}

function useUsuarioId(): string {
  const usuario = useEstadoSesion((estado) => estado.usuario);
  if (usuario === null) throw new Error('useIglesia sin sesión abierta');
  return usuario.id;
}

export function useMisIglesias(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();

  return useQuery({
    queryKey: clavesConsulta.mias(usuarioId),
    queryFn: () => misIglesias(repo, usuarioId),
  });
}

export function useGrupos(iglesiaId: string | null, repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();

  return useQuery({
    queryKey: clavesConsulta.grupos(usuarioId, iglesiaId ?? 'ninguna'),
    queryFn: () => (iglesiaId === null ? [] : gruposDe(repo, iglesiaId)),
  });
}

export function useEventos(iglesiaId: string | null, repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();

  return useQuery({
    queryKey: clavesConsulta.eventos(usuarioId, iglesiaId ?? 'ninguna'),
    queryFn: () => (iglesiaId === null ? [] : eventosDe(repo, { iglesiaId, usuarioId })),
  });
}

export function useMentorias(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();

  return useQuery({
    queryKey: clavesConsulta.mentorias(usuarioId),
    queryFn: () => misMentorias(repo, usuarioId),
  });
}

function useRefrescoDeIglesia() {
  const usuarioId = useUsuarioId();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['iglesia', usuarioId] });
  };
}

export function useBuscarIglesia(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  return useMutation({ mutationFn: (codigo: string) => buscarIglesia(repo, codigo) });
}

export function useSolicitarIngreso(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();
  const refrescar = useRefrescoDeIglesia();

  return useMutation({
    mutationFn: (iglesiaId: string) => solicitarIngreso(repo, { iglesiaId, usuarioId }),
    onSuccess: refrescar,
  });
}

export function useAbandonarIglesia(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();
  const refrescar = useRefrescoDeIglesia();

  return useMutation({
    mutationFn: (membresiaId: string) => abandonarIglesia(repo, { membresiaId, usuarioId }),
    onSuccess: refrescar,
  });
}

export function useAlternarInscripcion(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();
  const refrescar = useRefrescoDeIglesia();

  return useMutation({
    mutationFn: (parametros: { readonly eventoId: string; readonly inscrito: boolean }) =>
      alternarInscripcion(repo, { ...parametros, usuarioId }),
    onSuccess: refrescar,
  });
}

export function useTerminarMentoria(repositorio?: RepositorioIglesia) {
  const repo = useRepositorioIglesia(repositorio);
  const usuarioId = useUsuarioId();
  const refrescar = useRefrescoDeIglesia();

  return useMutation({
    mutationFn: (mentoriaId: string) => terminarMentoria(repo, { mentoriaId, usuarioId }),
    onSuccess: refrescar,
  });
}
