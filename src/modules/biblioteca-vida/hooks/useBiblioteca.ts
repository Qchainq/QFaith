// Puente entre la pantalla de la Biblioteca y los casos de uso.
//
// Aquí se compone lo que publican los demás módulos. La Biblioteca no importa
// nada del Diario ni de Oración: cada uno se adapta al contrato `Aportacion`
// en este archivo, que es el único punto donde los tres se tocan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useRepositorioDiario } from '@modules/diario/hooks/useDiario';
import { useRepositorioOracion } from '@modules/oracion/hooks/useOracion';
import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import type { FuenteBiblioteca } from '../models/biblioteca';
import {
  crearRepositorioBiblioteca,
  type RepositorioBiblioteca,
} from '../repositories/repositorioBiblioteca';
import { listarBiblioteca, organizar } from '../use-cases/organizarBiblioteca';

export const clavesConsulta = {
  biblioteca: (usuarioId: string) => ['biblioteca', usuarioId] as const,
};

export function useRepositorioBiblioteca(): RepositorioBiblioteca {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioBiblioteca({
        motor,
        almacen,
        usuarioId,
        claveBiblioteca: () => claveDeDominio('bibliotecaVida'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

/**
 * Fuentes disponibles.
 *
 * Cada módulo se adapta aquí, y solo aquí. Añadir uno nuevo es añadir un
 * adaptador a esta lista, sin tocar la Biblioteca ni el módulo de origen.
 */
export function useFuentes(): readonly FuenteBiblioteca[] {
  const diario = useRepositorioDiario();
  const oracion = useRepositorioOracion();

  return useMemo(
    () => [
      {
        async aportaciones() {
          const { entradas } = await diario.listar();
          return entradas.map((entrada) => ({
            origen: 'diario' as const,
            origenId: entrada.id,
            titulo: entrada.titulo,
            texto: `${entrada.cuerpo} ${entrada.etiquetas.join(' ')}`,
            ocurridoEn: entrada.creadaEn,
          }));
        },
      },
      {
        async aportaciones() {
          const { peticiones } = await oracion.listar();
          return peticiones.map((peticion) => ({
            origen: 'oracion' as const,
            origenId: peticion.id,
            titulo: peticion.titulo,
            texto: peticion.detalle,
            ocurridoEn: peticion.creadaEn,
          }));
        },
      },
    ],
    [diario, oracion],
  );
}

export function useBiblioteca() {
  const repositorio = useRepositorioBiblioteca();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.biblioteca(usuarioId),
    queryFn: () => listarBiblioteca(repositorio),
  });
}

export function useOrganizar() {
  const repositorio = useRepositorioBiblioteca();
  const fuentes = useFuentes();
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: () => organizar(repositorio, fuentes),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.biblioteca(usuarioId) });
    },
  });
}
