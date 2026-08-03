// Puente entre las pantallas de Perfil y los casos de uso.
//
// A diferencia del resto de módulos, aquí no interviene el motor de
// sincronización: el perfil y las preferencias no son contenido cifrado, no
// tienen versión ni conflicto, y van directos a PostgREST. Mezclarlos con la
// cola de cambios habría complicado el motor para nada.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { crearClienteRest } from '@shared/services/supabase/rest';
import {
  crearRepositorioPerfil,
  type RepositorioPerfil,
} from '@shared/services/supabase/repositorioPerfil';
import { useEstadoSesion } from '@shared/state/estadoSesion';

import type { BorradorPerfil } from '../models/perfil';
import {
  cancelarEliminacion,
  cargarAjustes,
  cargarPerfil,
  eliminacionPendiente,
  guardarAjustes,
  guardarPerfil,
  listarDispositivos,
  revocarDispositivo,
  solicitarEliminacion,
  type CambioAjustes,
} from '../use-cases/gestionPerfil';

export const clavesConsulta = {
  perfil: (usuarioId: string) => ['perfil', usuarioId, 'datos'] as const,
  ajustes: (usuarioId: string) => ['perfil', usuarioId, 'ajustes'] as const,
  dispositivos: (usuarioId: string) => ['perfil', usuarioId, 'dispositivos'] as const,
  eliminacion: (usuarioId: string) => ['perfil', usuarioId, 'eliminacion'] as const,
};

export function useRepositorioPerfil(repositorio?: RepositorioPerfil): RepositorioPerfil {
  return useMemo(
    () => repositorio ?? crearRepositorioPerfil(crearClienteRest({ proveerToken: tokenAcceso })),
    [repositorio],
  );
}

/**
 * Identidad de la sesión.
 *
 * Falla si no hay usuario: una pantalla de perfil sin saber de quién es no
 * puede leer ni escribir nada, y devolver una cadena vacía llevaría a
 * consultas contra un identificador que no existe.
 */
function useIdentidad(): { readonly usuarioId: string; readonly dispositivoId: string | null } {
  const usuario = useEstadoSesion((estado) => estado.usuario);
  const dispositivoId = useEstadoSesion((estado) => estado.dispositivoId);
  if (usuario === null) throw new Error('usePerfil sin sesión abierta');
  return { usuarioId: usuario.id, dispositivoId };
}

export function usePerfil(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();

  return useQuery({
    queryKey: clavesConsulta.perfil(usuarioId),
    queryFn: () => cargarPerfil(repo, usuarioId),
  });
}

export function useAjustes(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();

  return useQuery({
    queryKey: clavesConsulta.ajustes(usuarioId),
    queryFn: () => cargarAjustes(repo, usuarioId),
  });
}

export function useDispositivos(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId, dispositivoId } = useIdentidad();

  return useQuery({
    queryKey: clavesConsulta.dispositivos(usuarioId),
    queryFn: () => listarDispositivos(repo, usuarioId, dispositivoId),
  });
}

export function useEliminacionPendiente(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();

  return useQuery({
    queryKey: clavesConsulta.eliminacion(usuarioId),
    queryFn: () => eliminacionPendiente(repo, usuarioId),
  });
}

function useRefrescoDePerfil() {
  const { usuarioId } = useIdentidad();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['perfil', usuarioId] });
  };
}

export function useGuardarPerfil(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();
  const refrescar = useRefrescoDePerfil();

  return useMutation({
    mutationFn: (borrador: BorradorPerfil) => guardarPerfil(repo, usuarioId, borrador),
    onSuccess: refrescar,
  });
}

export function useGuardarAjustes(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();
  const refrescar = useRefrescoDePerfil();

  return useMutation({
    mutationFn: (cambio: CambioAjustes) => guardarAjustes(repo, usuarioId, cambio),
    onSuccess: refrescar,
  });
}

export function useRevocarDispositivo(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId, dispositivoId } = useIdentidad();
  const refrescar = useRefrescoDePerfil();

  return useMutation({
    mutationFn: (id: string) =>
      revocarDispositivo(repo, {
        usuarioId,
        dispositivoId: id,
        dispositivoActualId: dispositivoId,
      }),
    onSuccess: refrescar,
  });
}

export function useSolicitarEliminacion(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();
  const refrescar = useRefrescoDePerfil();

  return useMutation({
    mutationFn: () => solicitarEliminacion(repo, usuarioId),
    onSuccess: refrescar,
  });
}

export function useCancelarEliminacion(repositorio?: RepositorioPerfil) {
  const repo = useRepositorioPerfil(repositorio);
  const { usuarioId } = useIdentidad();
  const refrescar = useRefrescoDePerfil();

  return useMutation({
    mutationFn: (solicitudId: string) => cancelarEliminacion(repo, { usuarioId, solicitudId }),
    onSuccess: refrescar,
  });
}
