// Puente entre la pantalla del Pulso y el repositorio.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import { fechaDeHoy, type BorradorPulso } from '../models/pulso';
import { crearRepositorioPulso, type RepositorioPulso } from '../repositories/repositorioPulso';

export const clavesConsulta = {
  hoy: (usuarioId: string, fecha: string) => ['pulso', usuarioId, 'dia', fecha] as const,
  historial: (usuarioId: string) => ['pulso', usuarioId, 'historial'] as const,
};

export function useRepositorioPulso(): RepositorioPulso {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioPulso({
        motor,
        almacen,
        usuarioId,
        clavePulso: () => claveDeDominio('pulso'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

export function usePulsoDeHoy(hoy: string = fechaDeHoy()) {
  const repositorio = useRepositorioPulso();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.hoy(usuarioId, hoy),
    queryFn: () => repositorio.deLaFecha(hoy),
  });
}

export function useHistorialDePulso() {
  const repositorio = useRepositorioPulso();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.historial(usuarioId),
    queryFn: () => repositorio.listar(),
  });
}

export function useGuardarPulso() {
  const repositorio = useRepositorioPulso();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (borrador: BorradorPulso) => repositorio.guardar(borrador),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: ['pulso', usuarioId] });
    },
  });
}
