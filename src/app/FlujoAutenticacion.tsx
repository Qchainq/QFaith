// Enrutado del arranque según la fase de la sesión.
//
// Cada fase tiene exactamente una pantalla. Concentrarlo aquí evita que cada
// pantalla decida por su cuenta a dónde ir, que es como aparecen los estados
// imposibles: sesión abierta con la frase todavía sin confirmar, o contenido
// visible antes de desbloquear.
import { useTranslation } from 'react-i18next';

import { PantallaAcceso, type ModoAcceso } from '@modules/autenticacion/screens/PantallaAcceso';
import { PantallaDesbloqueo } from '@modules/autenticacion/screens/PantallaDesbloqueo';
import { PantallaFraseRecuperacion } from '@modules/autenticacion/screens/PantallaFraseRecuperacion';
import { PantallaOnboarding } from '@modules/autenticacion/screens/PantallaOnboarding';
import { PantallaRestaurar } from '@modules/autenticacion/screens/PantallaRestaurar';
import { PantallaBase } from '@shared/components/PantallaBase';
import { useEstadoSesion } from '@shared/state/estadoSesion';

export interface AccionesAutenticacion {
  readonly modo: ModoAcceso;
  readonly cargando: boolean;
  readonly errorGeneral?: string;
  readonly alEnviarCredenciales: (credenciales: { correo: string; contrasena: string }) => void;
  readonly alCambiarModo: () => void;
  readonly alRestaurar: (frase: string) => Promise<void>;
  readonly alDesbloquear: () => Promise<boolean>;
  /** Cierra la sesión de verdad: servidor y claves, no solo la pantalla. */
  readonly alCerrarSesion: () => Promise<void>;
}

export function FlujoAutenticacion({ acciones }: { readonly acciones: AccionesAutenticacion }) {
  const { t } = useTranslation();
  const fase = useEstadoSesion((estado) => estado.fase);
  const frase = useEstadoSesion((estado) => estado.fraseRecuperacionPendiente);
  const irASinSesion = useEstadoSesion((estado) => estado.irASinSesion);
  const comenzarRestauracion = useEstadoSesion((estado) => estado.comenzarRestauracion);
  const confirmarFraseGuardada = useEstadoSesion((estado) => estado.confirmarFraseGuardada);

  switch (fase) {
    case 'comprobando':
      return <PantallaBase titulo="QFaith" mensajeVacio={t('comun.cargando')} />;

    case 'onboarding':
      return <PantallaOnboarding alTerminar={irASinSesion} />;

    case 'sinSesion':
      return (
        <PantallaAcceso
          modo={acciones.modo}
          cargando={acciones.cargando}
          {...(acciones.errorGeneral === undefined ? {} : { errorGeneral: acciones.errorGeneral })}
          alEnviar={acciones.alEnviarCredenciales}
          alCambiarModo={acciones.alCambiarModo}
          alRestaurarConFrase={comenzarRestauracion}
        />
      );

    case 'preparandoCuenta':
      return <PantallaBase titulo="QFaith" mensajeVacio={t('seguridad.generandoClaves')} />;

    case 'mostrandoFrase':
      // Sin frase en memoria no hay nada que mostrar; se vuelve al acceso en
      // lugar de pintar una pantalla vacía.
      return frase === null ? (
        <PantallaAcceso
          modo={acciones.modo}
          alEnviar={acciones.alEnviarCredenciales}
          alCambiarModo={acciones.alCambiarModo}
        />
      ) : (
        <PantallaFraseRecuperacion frase={frase} alConfirmar={confirmarFraseGuardada} />
      );

    case 'restaurando':
      return <PantallaRestaurar alRestaurar={acciones.alRestaurar} alCancelar={irASinSesion} />;

    case 'bloqueada':
      return (
        <PantallaDesbloqueo
          alDesbloquear={acciones.alDesbloquear}
          alCerrarSesion={acciones.alCerrarSesion}
        />
      );

    case 'lista':
      return null;
  }
}
