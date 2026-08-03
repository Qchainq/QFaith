// Puente entre la pantalla del Pulso y el repositorio.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import { fechaDeHoy, type BorradorPulso } from '../models/pulso';
import { crearRepositorioPulso, type RepositorioPulso } from '../repositories/repositorioPulso';

export const clavesConsulta = {
  hoy: (usuarioId: string, fecha: string) => ['pulso', usuarioId, 'dia', fecha] as const,
};

// No hay hook de historial a propósito. El repositorio sabe listar los días
// —hace falta para exportar y para la papelera—, pero la pantalla no los
// enseña: ver «llevas cuatro días triste» no ayuda a nadie a estar mejor
// (invariante 12).

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
