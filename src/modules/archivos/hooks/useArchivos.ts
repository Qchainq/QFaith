// Puente entre las pantallas y el repositorio de archivos.
//
// Los archivos no tienen pantalla propia: se adjuntan a un memorial, a una
// entrada del diario, a una oración o a la nota de un sermón. Por eso todo
// aquí lleva el registro de destino como parámetro y la caché se organiza por
// ese destino.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { BorradorArchivo, OrigenArchivo } from '../models/archivo';
import {
  crearRepositorioArchivos,
  type RepositorioArchivos,
} from '../repositories/repositorioArchivos';

export const clavesConsulta = {
  deOrigen: (usuarioId: string, origen: OrigenArchivo, origenId: string) =>
    ['archivos', usuarioId, origen, origenId] as const,
};

export function useRepositorioArchivos(): RepositorioArchivos {
  const { motor, almacen, usuarioId, almacenamientoRemoto, almacenamientoLocal } =
    useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioArchivos({
        motor,
        almacen,
        usuarioId,
        remoto: almacenamientoRemoto,
        local: almacenamientoLocal,
        claveMedios: () => claveDeDominio('medios'),
        claveEnvoltorio: () => clavesDerivadas().claveEnvoltorio,
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId, almacenamientoRemoto, almacenamientoLocal],
  );
}

export function useAdjuntos(origen: OrigenArchivo, origenId: string) {
  const repositorio = useRepositorioArchivos();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.deOrigen(usuarioId, origen, origenId),
    queryFn: () => repositorio.deOrigen(origen, origenId),
    // Un registro sin guardar todavía no tiene identificador con el que
    // buscar adjuntos.
    enabled: origenId.length > 0,
  });
}

export function useAdjuntar(origen: OrigenArchivo, origenId: string) {
  const repositorio = useRepositorioArchivos();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (borrador: BorradorArchivo) => repositorio.adjuntar(borrador),
    onSuccess: () => {
      void cliente.invalidateQueries({
        queryKey: clavesConsulta.deOrigen(usuarioId, origen, origenId),
      });
    },
  });
}

export function useRetirarAdjunto(origen: OrigenArchivo, origenId: string) {
  const repositorio = useRepositorioArchivos();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => repositorio.retirar(id),
    onSuccess: () => {
      void cliente.invalidateQueries({
        queryKey: clavesConsulta.deOrigen(usuarioId, origen, origenId),
      });
    },
  });
}

/**
 * Abre un archivo y devuelve sus bytes en claro.
 *
 * Es una mutación y no una consulta a propósito: descifrar un archivo es algo
 * que la persona **pide**, no algo que ocurra por tener la pantalla abierta.
 * Como consulta, React Query lo abriría solo al montar y al recuperar el
 * foco, y tendría contenido privado descifrado en su caché sin que nadie lo
 * haya pedido.
 */
export function useAbrirArchivo() {
  const repositorio = useRepositorioArchivos();

  return useMutation({
    mutationFn: (id: string) => repositorio.abrir(id),
  });
}
