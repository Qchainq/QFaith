// Arranque de la aplicación: decide si mostrar el flujo de autenticación o
// las pestañas.
//
// El contenido privado solo se monta cuando la sesión está lista. Mientras
// tanto no existe siquiera en el árbol de componentes, así que no puede
// filtrarse por descuido.
//
// Aquí no hay lógica de negocio: solo se traduce el paso que devuelve el caso
// de uso a una fase de la sesión. Quien decide qué hacer con una cuenta es
// `accesoACuenta` (invariante 10).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import type { ModoAcceso } from '@modules/autenticacion/screens/PantallaAcceso';
import {
  crearCuenta,
  entrarConCuenta,
  reanudarSesion,
  restaurarCuenta,
  salir,
  type DependenciasAcceso,
  type SiguientePaso,
} from '@modules/autenticacion/use-cases/accesoACuenta';
import { esErrorApp } from '@shared/errores/erroresApp';
import { pedirDesbloqueoBiometrico } from '@shared/services/keys/almacenSeguro';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import i18n from '@shared/i18n';

import { ProveedorAnalitica } from '@modules/analitica/services/contextoAnalitica';
import { AvisosAlDia } from '@modules/notificaciones/services/AvisosAlDia';
import { ProveedorNotificaciones } from '@modules/notificaciones/services/contextoNotificaciones';
import { ProveedorSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';

import { FlujoAutenticacion, type AccionesAutenticacion } from './FlujoAutenticacion';
import { NavegacionRaiz } from './NavegacionRaiz';

const DEPENDENCIAS: DependenciasAcceso = {
  plataforma: Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web',
};

/**
 * Traduce una clave del catálogo de notificaciones.
 *
 * A nivel de módulo y no dentro del render: el proveedor memoriza el servicio
 * con esta función entre sus dependencias, y una función nueva en cada vuelta
 * lo reconstruiría —y con él, la referencia de preferencias— sin motivo.
 */
const traducirClave = (clave: string): string => i18n.t(clave);

export function Arranque() {
  const fase = useEstadoSesion((estado) => estado.fase);
  const usuario = useEstadoSesion((estado) => estado.usuario);
  const dispositivoId = useEstadoSesion((estado) => estado.dispositivoId);
  const irAOnboarding = useEstadoSesion((estado) => estado.irAOnboarding);
  const irASinSesion = useEstadoSesion((estado) => estado.irASinSesion);
  const comenzarAltaDeCuenta = useEstadoSesion((estado) => estado.comenzarAltaDeCuenta);
  const comenzarRestauracion = useEstadoSesion((estado) => estado.comenzarRestauracion);
  const prepararFrase = useEstadoSesion((estado) => estado.prepararFrase);
  const olvidarSesion = useEstadoSesion((estado) => estado.cerrarSesion);
  const abrirSesion = useEstadoSesion((estado) => estado.abrirSesion);

  const [modo, setModo] = useState<ModoAcceso>('registro');
  const [cargando, setCargando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | undefined>(undefined);

  // El arranque se comprueba una sola vez. Sin esto, cualquier redibujado
  // durante la comprobación la lanzaría otra vez.
  const comprobando = useRef(false);

  const aplicarPaso = useCallback(
    (paso: SiguientePaso): void => {
      switch (paso.tipo) {
        case 'listo':
          abrirSesion(paso.usuario, paso.dispositivoId);
          return;
        case 'mostrarFrase':
          // La sesión no se abre hasta que confirma que la anotó: es la única
          // vez que la frase existe fuera de su cabeza. Se hace en una sola
          // actualización para que la fase no pase por `lista` ni un instante.
          prepararFrase(paso.usuario, paso.frase, paso.dispositivoId);
          return;
        case 'restaurarConFrase':
          comenzarRestauracion();
          return;
        case 'confirmarCorreo':
          setErrorGeneral(i18n.t('errores.cuenta.correoSinConfirmar'));
          irASinSesion();
          return;
        case 'sinSesion':
          irASinSesion();
      }
    },
    [abrirSesion, comenzarRestauracion, irASinSesion, prepararFrase],
  );

  const mostrarError = useCallback((causa: unknown): void => {
    // Nunca se muestra el error del proveedor tal cual: puede llevar dentro
    // el correo de la persona (invariante 2).
    setErrorGeneral(esErrorApp(causa) ? i18n.t(causa.claveMensaje) : i18n.t('errores.generico'));
  }, []);

  useEffect(() => {
    if (fase !== 'comprobando' || comprobando.current) {
      return;
    }
    comprobando.current = true;

    void (async () => {
      try {
        const paso = await reanudarSesion(DEPENDENCIAS);
        // Sin sesión guardada, primero se explica qué es la aplicación. Que
        // alguien vea el onboarding no revela nada de nadie.
        if (paso.tipo === 'sinSesion') {
          irAOnboarding();
          return;
        }
        aplicarPaso(paso);
      } catch {
        // Si la comprobación falla —sin red, por ejemplo— se entra por el
        // camino normal en lugar de dejar al usuario mirando una pantalla de
        // carga eterna.
        irAOnboarding();
      }
    })();
  }, [fase, aplicarPaso, irAOnboarding]);

  const enviarCredenciales = useCallback(
    (credenciales: { correo: string; contrasena: string }): void => {
      setErrorGeneral(undefined);
      setCargando(true);
      if (modo === 'registro') {
        comenzarAltaDeCuenta();
      }

      void (async () => {
        try {
          const paso =
            modo === 'registro'
              ? await crearCuenta(DEPENDENCIAS, credenciales)
              : await entrarConCuenta(DEPENDENCIAS, credenciales);
          aplicarPaso(paso);
        } catch (causa) {
          mostrarError(causa);
          irASinSesion();
        } finally {
          setCargando(false);
        }
      })();
    },
    [modo, aplicarPaso, comenzarAltaDeCuenta, irASinSesion, mostrarError],
  );

  const restaurar = useCallback(
    async (frase: string): Promise<void> => {
      setErrorGeneral(undefined);
      setCargando(true);
      try {
        aplicarPaso(await restaurarCuenta(DEPENDENCIAS, frase));
      } catch (causa) {
        mostrarError(causa);
      } finally {
        setCargando(false);
      }
    },
    [aplicarPaso, mostrarError],
  );

  const desbloquear = useCallback(async (): Promise<boolean> => {
    const abierto = await pedirDesbloqueoBiometrico(i18n.t('seguridad.desbloquearMotivo'));
    if (abierto) {
      // La biometría solo confirma quién está delante; el usuario ya estaba
      // en el estado desde que se abrió la sesión.
      const actual = useEstadoSesion.getState().usuario;
      if (actual !== null) {
        abrirSesion(actual);
      }
    }
    return abierto;
  }, [abrirSesion]);

  const cerrarSesion = useCallback(async (): Promise<void> => {
    try {
      // Cierra la sesión en el servidor y descarta las claves de memoria. Sin
      // esto, «cerrar sesión» solo cambiaba de pantalla: el token seguía
      // siendo válido y el contenido privado, descifrable.
      await salir();
    } catch {
      // Si el servidor no responde, la salida local se hace igualmente: dejar
      // a alguien dentro porque no hay red sería peor.
    }
    olvidarSesion();
  }, [olvidarSesion]);

  const acciones = useMemo<AccionesAutenticacion>(
    () => ({
      modo,
      cargando,
      ...(errorGeneral === undefined ? {} : { errorGeneral }),
      alEnviarCredenciales: enviarCredenciales,
      alCambiarModo: () => {
        setErrorGeneral(undefined);
        setModo(modo === 'registro' ? 'inicioSesion' : 'registro');
      },
      alRestaurar: restaurar,
      alDesbloquear: desbloquear,
      alCerrarSesion: cerrarSesion,
    }),
    [modo, cargando, errorGeneral, enviarCredenciales, restaurar, desbloquear, cerrarSesion],
  );

  if (fase === 'lista') {
    // Sin usuario o sin dispositivo dado de alta no se puede sincronizar, y
    // montar el contenido igualmente escribiría en una base que nadie sube.
    // Es un estado que no debería darse; si se da, se vuelve al acceso.
    if (usuario === null || dispositivoId === null) {
      return <FlujoAutenticacion acciones={acciones} />;
    }
    return (
      <ProveedorSincronizacion usuarioId={usuario.id} dispositivoId={dispositivoId}>
        {/*
          Los avisos van dentro de la sincronización porque salen de los
          hábitos, que viven en la base local. Y `AvisosAlDia` no pinta nada:
          solo mantiene programado lo que corresponde mientras la aplicación
          está abierta.
        */}
        <ProveedorNotificaciones traducir={traducirClave}>
          <AvisosAlDia />
          {/*
            La analítica va por dentro y no por fuera: sin consentimiento no
            envía nada, y el consentimiento vive en los ajustes, que necesitan
            la sesión abierta.
          */}
          <ProveedorAnalitica>
            <NavegacionRaiz alCerrarSesion={() => void cerrarSesion()} />
          </ProveedorAnalitica>
        </ProveedorNotificaciones>
      </ProveedorSincronizacion>
    );
  }

  return <FlujoAutenticacion acciones={acciones} />;
}
