// Puente entre las pantallas de Biblia y los casos de uso.
//
// Las dos naturalezas del módulo se notan aquí: el texto bíblico se cachea
// mucho tiempo porque es público e inmutable; las notas se releen en cuanto
// cambian, como en cualquier otro módulo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';
import { crearClienteRest } from '@shared/services/supabase/rest';

import type { BorradorNota, BorradorSubrayado } from '../models/biblia';
import { crearRepositorioBiblia, type RepositorioBiblia } from '../repositories/repositorioBiblia';
import {
  crearRepositorioMarcasBiblicas,
  type RepositorioMarcasBiblicas,
} from '../repositories/repositorioMarcasBiblicas';
import {
  crearRepositorioNotasBiblicas,
  type RepositorioNotasBiblicas,
} from '../repositories/repositorioNotasBiblicas';
import {
  eliminarNota,
  guardarNota,
  leerCapitulo,
  listarLibros,
  listarTraducciones,
  notasDelCapitulo,
} from '../use-cases/lecturaBiblia';

/**
 * El texto bíblico no cambia. Se cachea durante toda la sesión en lugar de
 * volver a pedirlo cada vez: es contenido público, y el Documento 9 lo
 * permite expresamente solo para este caso.
 */
const CACHE_TEXTO_PUBLICO = 24 * 60 * 60 * 1000;

export const clavesConsulta = {
  traducciones: () => ['biblia', 'traducciones'] as const,
  libros: (traduccionId: string) => ['biblia', 'libros', traduccionId] as const,
  capitulo: (traduccionId: string, libro: string, capitulo: number) =>
    ['biblia', 'capitulo', traduccionId, libro, capitulo] as const,
  notas: (usuarioId: string, libro: string, capitulo: number) =>
    ['biblia', usuarioId, 'notas', libro, capitulo] as const,
  subrayados: (usuarioId: string, traduccionId: string, libro: string, capitulo: number) =>
    ['biblia', usuarioId, 'subrayados', traduccionId, libro, capitulo] as const,
  marcadores: (usuarioId: string) => ['biblia', usuarioId, 'marcadores'] as const,
};

export function useRepositorioBiblia(): RepositorioBiblia {
  return useMemo(
    () => crearRepositorioBiblia({ rest: crearClienteRest({ proveerToken: tokenAcceso }) }),
    [],
  );
}

export function useRepositorioNotas(): RepositorioNotasBiblicas {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioNotasBiblicas({
        motor,
        almacen,
        usuarioId,
        claveNotas: () => claveDeDominio('notaBiblica'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function useTraducciones() {
  const repositorio = useRepositorioBiblia();
  return useQuery({
    queryKey: clavesConsulta.traducciones(),
    queryFn: () => listarTraducciones(repositorio),
    staleTime: CACHE_TEXTO_PUBLICO,
  });
}

export function useLibros(traduccionId: string | null) {
  const repositorio = useRepositorioBiblia();
  return useQuery({
    queryKey: clavesConsulta.libros(traduccionId ?? ''),
    queryFn: () => listarLibros(repositorio, traduccionId ?? ''),
    enabled: traduccionId !== null,
    staleTime: CACHE_TEXTO_PUBLICO,
  });
}

export function useCapitulo(parametros: {
  readonly traduccionId: string | null;
  readonly libro: string | null;
  readonly capitulo: number;
}) {
  const repositorio = useRepositorioBiblia();
  const habilitada = parametros.traduccionId !== null && parametros.libro !== null;

  return useQuery({
    queryKey: clavesConsulta.capitulo(
      parametros.traduccionId ?? '',
      parametros.libro ?? '',
      parametros.capitulo,
    ),
    queryFn: () =>
      leerCapitulo(repositorio, {
        traduccionId: parametros.traduccionId ?? '',
        libro: parametros.libro ?? '',
        capitulo: parametros.capitulo,
      }),
    enabled: habilitada,
    staleTime: CACHE_TEXTO_PUBLICO,
  });
}

export function useNotasDelCapitulo(libro: string | null, capitulo: number) {
  const repositorio = useRepositorioNotas();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.notas(usuarioId, libro ?? '', capitulo),
    queryFn: () => notasDelCapitulo(repositorio, { libro: libro ?? '', capitulo }),
    enabled: libro !== null,
  });
}

export function useGuardarNota() {
  const repositorio = useRepositorioNotas();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (borrador: BorradorNota) => guardarNota(repositorio, borrador),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['biblia', usuarioId, 'notas'] });
    },
  });
}

export function useEliminarNota() {
  const repositorio = useRepositorioNotas();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => eliminarNota(repositorio, id),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['biblia', usuarioId, 'notas'] });
    },
  });
}

export function useRepositorioMarcas(): RepositorioMarcasBiblicas {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioMarcasBiblicas({
        motor,
        almacen,
        usuarioId,
        // Comparten dominio con las notas: es lo mismo, la persona escribiendo
        // sobre un pasaje. Un dominio por gesto multiplicaría las claves sin
        // separar nada de verdad.
        claveNotas: () => claveDeDominio('notaBiblica'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function useSubrayadosDelCapitulo(
  traduccionId: string | null,
  libro: string | null,
  capitulo: number,
) {
  const repositorio = useRepositorioMarcas();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.subrayados(usuarioId, traduccionId ?? '', libro ?? '', capitulo),
    queryFn: () =>
      repositorio.delCapitulo({
        traduccionId: traduccionId ?? '',
        libro: libro ?? '',
        capitulo,
      }),
    enabled: traduccionId !== null && libro !== null,
  });
}

export function useSubrayar() {
  const repositorio = useRepositorioMarcas();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (borrador: BorradorSubrayado) => repositorio.subrayar(borrador),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['biblia', usuarioId, 'subrayados'] });
    },
  });
}

export function useQuitarSubrayado() {
  const repositorio = useRepositorioMarcas();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => repositorio.quitarSubrayado(id),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['biblia', usuarioId, 'subrayados'] });
    },
  });
}

export function useMarcadores() {
  const repositorio = useRepositorioMarcas();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.marcadores(usuarioId),
    queryFn: () => repositorio.marcadores(),
  });
}

export function useMarcar() {
  const repositorio = useRepositorioMarcas();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (parametros: {
      readonly traduccionId: string;
      readonly libro: string;
      readonly capitulo: number;
      readonly versiculo?: number | null;
    }) => repositorio.marcar(parametros),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.marcadores(usuarioId) });
    },
  });
}

export function useQuitarMarcador() {
  const repositorio = useRepositorioMarcas();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => repositorio.quitarMarcador(id),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.marcadores(usuarioId) });
    },
  });
}
