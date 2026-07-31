// Arranque de la aplicación: decide si mostrar el flujo de autenticación o
// las pestañas.
//
// El contenido privado solo se monta cuando la sesión está lista. Mientras
// tanto no existe siquiera en el árbol de componentes, así que no puede
// filtrarse por descuido.
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ModoAcceso } from '@modules/autenticacion/screens/PantallaAcceso';
import { pedirDesbloqueoBiometrico } from '@shared/services/keys/almacenSeguro';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import i18n from '@shared/i18n';

import { FlujoAutenticacion, type AccionesAutenticacion } from './FlujoAutenticacion';
import { NavegacionRaiz } from './NavegacionRaiz';

export function Arranque() {
  const fase = useEstadoSesion((estado) => estado.fase);
  const irAOnboarding = useEstadoSesion((estado) => estado.irAOnboarding);
  const abrirSesion = useEstadoSesion((estado) => estado.abrirSesion);

  const [modo, setModo] = useState<ModoAcceso>('registro');

  useEffect(() => {
    // Arranque provisional mientras no hay credenciales de Supabase: se
    // entra por el onboarding. Cuando exista el servicio de autenticación,
    // aquí se comprobará si hay sesión y claves en este dispositivo.
    if (fase === 'comprobando') {
      irAOnboarding();
    }
  }, [fase, irAOnboarding]);

  const desbloquear = useCallback(async (): Promise<boolean> => {
    const abierto = await pedirDesbloqueoBiometrico(i18n.t('seguridad.desbloquearMotivo'));
    if (abierto) {
      // El usuario real llegará del servicio de autenticación; aquí se
      // conserva el que ya estuviera en el estado.
      const actual = useEstadoSesion.getState().usuario;
      if (actual !== null) {
        abrirSesion(actual);
      }
    }
    return abierto;
  }, [abrirSesion]);

  const acciones = useMemo<AccionesAutenticacion>(
    () => ({
      modo,
      cargando: false,
      alEnviarCredenciales: () => {
        // Pendiente del servicio de autenticación contra Supabase.
      },
      alCambiarModo: () => setModo(modo === 'registro' ? 'inicioSesion' : 'registro'),
      alRestaurar: async () => {
        // Pendiente: necesita los sobres de claves que guarda el servidor.
      },
      alDesbloquear: desbloquear,
    }),
    [modo, desbloquear],
  );

  if (fase === 'lista') {
    return <NavegacionRaiz />;
  }

  return <FlujoAutenticacion acciones={acciones} />;
}
