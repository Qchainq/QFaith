// Puente entre la pantalla del acompañante y los casos de uso.
//
// Aquí se construye el servicio de IA con el proveedor real. Es el único
// punto del módulo donde aparece un proveedor, y ni siquiera es un SDK: es la
// función Edge, que es la que guarda la credencial.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { crearProveedorEdge } from '@shared/services/ia/proveedorEdge';
import { crearServicioIa, type ServicioIa } from '@shared/services/ia/servicioIa';
import type { ProveedorIa } from '@shared/services/ia/tipos';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import { crearRepositorioIa, type RepositorioIa } from '../repositories/repositorioIa';
import {
  borrarMemoria,
  enviarMensaje,
  listarConversaciones,
  listarMensajes,
} from '../use-cases/conversar';

export const clavesConsulta = {
  conversaciones: (usuarioId: string) => ['ia', usuarioId, 'conversaciones'] as const,
  mensajes: (usuarioId: string, conversacionId: string) =>
    ['ia', usuarioId, 'mensajes', conversacionId] as const,
};

export function useRepositorioIa(): RepositorioIa {
  const { motor, almacen, usuarioId } = useSincronizacion();

  return useMemo(
    () =>
      crearRepositorioIa({
        motor,
        almacen,
        usuarioId,
        claveIa: () => claveDeDominio('ia'),
        claveHash: () => clavesDerivadas().claveHash,
      }),
    [motor, almacen, usuarioId],
  );
}

/**
 * Servicio de IA listo para usar.
 *
 * `autorizadoEnviar` llega desde la pantalla, no de una configuración global:
 * el permiso es por conversación y por sesión, no una casilla que alguien
 * marcó una vez y olvidó.
 */
export function useServicioIa(autorizadoEnviar: boolean, proveedor?: ProveedorIa): ServicioIa {
  const { t } = useTranslation();

  return useMemo(
    () =>
      crearServicioIa({
        proveedor: proveedor ?? crearProveedorEdge({ proveerToken: tokenAcceso }),
        textos: {
          crisis: t('ia.crisis'),
          respaldo: t('ia.respaldo'),
          sinConexion: t('ia.sinConexion'),
        },
        autorizadoEnviar,
      }),
    [autorizadoEnviar, proveedor, t],
  );
}

export function useConversaciones() {
  const repositorio = useRepositorioIa();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.conversaciones(usuarioId),
    queryFn: () => listarConversaciones(repositorio),
  });
}

export function useMensajes(conversacionId: string | null) {
  const repositorio = useRepositorioIa();
  const { usuarioId } = useSincronizacion();

  return useQuery({
    queryKey: clavesConsulta.mensajes(usuarioId, conversacionId ?? 'nueva'),
    queryFn: () => (conversacionId === null ? [] : listarMensajes(repositorio, conversacionId)),
  });
}

function useRefrescoDeIa() {
  const { usuarioId } = useSincronizacion();
  const cliente = useQueryClient();
  return () => {
    void cliente.invalidateQueries({ queryKey: ['ia', usuarioId] });
  };
}

export function useEnviarMensaje(parametros: {
  readonly servicio: ServicioIa;
  readonly conversacionId: string | null;
}) {
  const repositorio = useRepositorioIa();
  const refrescar = useRefrescoDeIa();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (texto: string) =>
      enviarMensaje({
        repositorio,
        servicio: parametros.servicio,
        conversacionId: parametros.conversacionId,
        texto,
        textoRespaldo: t('ia.respaldo'),
        textoSinAutorizacion: t('ia.errores.sinAutorizacion'),
      }),
    onSuccess: refrescar,
  });
}

export function useBorrarMemoria() {
  const repositorio = useRepositorioIa();
  const refrescar = useRefrescoDeIa();

  return useMutation({
    mutationFn: () => borrarMemoria(repositorio),
    onSuccess: refrescar,
  });
}
