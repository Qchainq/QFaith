// Puente entre la pantalla de suscripción y el servidor.
//
// **Ninguna mutación de aquí concede acceso.** Comprar devuelve un recibo que
// valida el servidor; lo que esta capa hace después es volver a leer el
// estado, no decidirlo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { crearClienteRest } from '@shared/services/supabase/rest';
import { pagosNoDisponibles, type PuertoPagos } from '@shared/services/suscripcion/puertoPagos';
import {
  crearRepositorioSuscripcion,
  type RepositorioSuscripcion,
} from '@shared/services/suscripcion/repositorioSuscripcion';

export const clavesConsulta = {
  suscripcion: () => ['suscripcion'] as const,
  productos: () => ['suscripcion', 'productos'] as const,
};

export function useRepositorioSuscripcion(): RepositorioSuscripcion {
  return useMemo(
    () => crearRepositorioSuscripcion(crearClienteRest({ proveerToken: tokenAcceso })),
    [],
  );
}

export function useSuscripcionActual(repositorio?: RepositorioSuscripcion) {
  const propio = useRepositorioSuscripcion();
  const usado = repositorio ?? propio;

  return useQuery({
    queryKey: clavesConsulta.suscripcion(),
    queryFn: () => usado.actual(),
  });
}

export function useProductos(pagos: PuertoPagos = pagosNoDisponibles) {
  return useQuery({
    queryKey: clavesConsulta.productos(),
    queryFn: () => pagos.productos(),
  });
}

/**
 * Comprar.
 *
 * Devuelve el recibo y vuelve a leer el estado. **No concede nada**: entre una
 * cosa y otra, el servidor tiene que haber validado el recibo contra la
 * tienda. Si todavía no lo ha hecho, la lectura dirá que no hay suscripción, y
 * eso es correcto: es lo que hay hasta que se valide.
 */
export function useComprar(pagos: PuertoPagos = pagosNoDisponibles) {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: (productoId: string) => pagos.comprar(productoId),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.suscripcion() });
    },
  });
}

/** Restaurar compras. Cambiar de teléfono no puede obligar a pagar dos veces. */
export function useRestaurarCompras(pagos: PuertoPagos = pagosNoDisponibles) {
  const cliente = useQueryClient();

  return useMutation({
    mutationFn: () => pagos.restaurar(),
    onSuccess: () => {
      void cliente.invalidateQueries({ queryKey: clavesConsulta.suscripcion() });
    },
  });
}
