// Contenedor del módulo de IA.
//
// El permiso de envío vive aquí, en estado de pantalla, y **no se persiste a
// propósito**: se pide de nuevo cada vez que se entra. Guardarlo lo
// convertiría en una casilla que alguien marcó hace meses, que es justo lo
// contrario de un consentimiento (Documento 6).
//
// Sin permiso la pantalla sigue funcionando. Hace falta que siga funcionando:
// la detección de crisis es local y previa al envío, así que quien escribe a
// las tres de la mañana recibe respuesta aunque no haya autorizado nada y
// aunque no haya red.
import { useState } from 'react';

import type { ProveedorIa } from '@shared/services/ia/tipos';

import {
  useBorrarMemoria,
  useConversaciones,
  useEnviarMensaje,
  useMensajes,
  useServicioIa,
} from '../hooks/useIa';
import { PantallaIa } from './PantallaIa';

export interface PropsIaContenedor {
  /** Inyectable para las pruebas: evita depender del proveedor real. */
  readonly proveedor?: ProveedorIa;
}

export function IaContenedor({ proveedor }: PropsIaContenedor = {}) {
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [autorizado, setAutorizado] = useState(false);
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);

  const servicio = useServicioIa(autorizado, proveedor);
  const conversaciones = useConversaciones();
  const mensajes = useMensajes(conversacionId);
  const enviar = useEnviarMensaje({ servicio, conversacionId });
  const borrar = useBorrarMemoria();

  return (
    <PantallaIa
      mensajes={mensajes.data ?? []}
      conversaciones={conversaciones.data ?? []}
      conversacionId={conversacionId}
      borrador={borrador}
      autorizado={autorizado}
      cargando={mensajes.isPending}
      pensando={enviar.isPending}
      borrando={borrar.isPending}
      confirmandoBorrado={confirmandoBorrado}
      alEscribir={setBorrador}
      alEnviar={() => {
        if (borrador.trim().length === 0) return;
        // El borrador se limpia solo cuando el mensaje quedó guardado. Si algo
        // falla, lo escrito sigue en el campo.
        enviar.mutate(borrador, {
          onSuccess: (resultado) => {
            setConversacionId(resultado.conversacionId);
            setBorrador('');
          },
        });
      }}
      alAutorizar={() => setAutorizado(true)}
      alAbrirConversacion={(id) => {
        setConversacionId(id);
        setBorrador('');
      }}
      alPedirBorrado={() => setConfirmandoBorrado(true)}
      alCancelarBorrado={() => setConfirmandoBorrado(false)}
      alConfirmarBorrado={() => {
        borrar.mutate(undefined, {
          onSuccess: () => {
            setConfirmandoBorrado(false);
            setConversacionId(null);
          },
        });
      }}
    />
  );
}
