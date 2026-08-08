// Raíz de composición de la analítica.
//
// Único sitio donde se construye el servicio y donde se le dice si hay
// consentimiento. Las pantallas piden el servicio a este contexto; ninguna
// habla con un proveedor de analítica, igual que ninguna habla con un
// proveedor de IA.
//
// ── El consentimiento vive en el perfil y manda aquí ──────────────────────
//
// El interruptor está en los ajustes y se guarda en el servidor —es una
// preferencia, no contenido—. Este proveedor lo observa y se lo pasa al
// servicio cada vez que cambia. Apagarlo hace dos cosas: dejar de enviar y
// **pedir al proveedor que olvide**, porque el Documento 14 exige retirada de
// consentimiento y eliminación, y cumplir solo la primera deja lo ya enviado
// donde estaba.
//
// Mientras los ajustes cargan se toma «no». Cualquier otra cosa sería enviar
// antes de saber si se puede.
//
// ── El identificador de sesión no se guarda ───────────────────────────────
//
// Se genera al montar y muere con la ejecución. Uno persistente permitiría
// seguir a la misma persona entre sesiones, y el documento pide analítica
// agregada. Que dos aperturas de la aplicación no se puedan enlazar es el
// precio, y es el correcto.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { useAjustes } from '@modules/perfil/hooks/usePerfil';
import { generarUuid } from '@shared/services/crypto/aleatoriedad';
import type { PuertoAnalitica } from '@shared/services/analitica/puertoAnalitica';
import {
  crearServicioAnalitica,
  type ServicioAnalitica,
} from '@shared/services/analitica/servicioAnalitica';
import Constants from 'expo-constants';

const Contexto = createContext<ServicioAnalitica | undefined>(undefined);

export interface PropsProveedorAnalitica {
  readonly children: ReactNode;
  /** Para las pruebas: sustituye al proveedor de analítica. */
  readonly puerto?: PuertoAnalitica;
  /** Para las pruebas: sustituye la lectura del consentimiento del perfil. */
  readonly consentida?: boolean;
}

export function ProveedorAnalitica({ children, puerto, consentida }: PropsProveedorAnalitica) {
  const ajustes = useAjustes();

  const servicio = useMemo(
    () =>
      crearServicioAnalitica({
        ...(puerto === undefined ? {} : { puerto }),
        contexto: {
          // De `app.config.ts`, que es la única fuente de la versión. Un
          // literal aquí quedaría desfasado en cuanto alguien publicara.
          version: Constants.expoConfig?.version ?? '0.0.0',
          plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
          versionSistema: String(Platform.Version),
          // Ver la cabecera: se genera aquí y no se guarda en ninguna parte.
          sesionId: generarUuid(),
        },
      }),
    [puerto],
  );

  const autoriza = consentida ?? ajustes.data?.analitica ?? false;

  useEffect(() => {
    void servicio.consentir(autoriza);
  }, [servicio, autoriza]);

  return <Contexto.Provider value={servicio}>{children}</Contexto.Provider>;
}

/**
 * El servicio de analítica.
 *
 * Devuelve `null` fuera del proveedor en lugar de lanzar. La analítica es lo
 * único del sistema que puede faltar sin que nada deje de funcionar, y una
 * excepción por no poder contar una pantalla sería el peor cambio posible.
 */
export function useAnalitica(): ServicioAnalitica | null {
  return useContext(Contexto) ?? null;
}
