// Contenedor del módulo de Perfil.
//
// Las cuatro pantallas viven en una máquina de estados local en vez de en una
// pila de navegación: son vistas de la misma cosa, y meterlas en la pila
// llenaría el botón «atrás» de pasos que nadie quiere deshacer uno a uno.
import { useState } from 'react';
import { ExportarContenedor } from '@modules/exportacion/screens/ExportarContenedor';
import { SuscripcionContenedor } from '@modules/suscripcion/screens/SuscripcionContenedor';

import { useEstadoSesion } from '@shared/state/estadoSesion';
import { esErrorApp } from '@shared/errores/erroresApp';
import type { RepositorioPerfil } from '@shared/services/supabase/repositorioPerfil';

import {
  useAjustes,
  useCancelarEliminacion,
  useDispositivos,
  useEliminacionPendiente,
  useGuardarAjustes,
  useGuardarPerfil,
  usePerfil,
  useRevocarDispositivo,
  useSolicitarEliminacion,
} from '../hooks/usePerfil';
import type { BorradorPerfil } from '../models/perfil';
import { AJUSTES_POR_DEFECTO } from '../use-cases/gestionPerfil';
import { PantallaConfiguracion } from './PantallaConfiguracion';
import { PantallaDispositivos } from './PantallaDispositivos';
import { PantallaEditarPerfil } from './PantallaEditarPerfil';
import { PantallaEliminarCuenta } from './PantallaEliminarCuenta';
import { PantallaPerfil } from './PantallaPerfil';

type Vista =
  'portada' | 'editar' | 'configuracion' | 'dispositivos' | 'eliminar' | 'exportar' | 'suscripcion';

export interface PropsPerfilContenedor {
  /** Inyectable para las pruebas: evita depender de la red. */
  readonly repositorio?: RepositorioPerfil;
  readonly alCerrarSesion?: () => void;
  readonly ahora?: Date;
}

export function PerfilContenedor({
  repositorio,
  alCerrarSesion,
  ahora,
}: PropsPerfilContenedor = {}) {
  const [vista, setVista] = useState<Vista>('portada');
  const [confirmandoBorrado, setConfirmandoBorrado] = useState(false);
  const [errorAjustes, setErrorAjustes] = useState<string | null>(null);

  const correo = useEstadoSesion((estado) => estado.usuario?.correo ?? '');

  const perfil = usePerfil(repositorio);
  const ajustes = useAjustes(repositorio);
  const dispositivos = useDispositivos(repositorio);
  const pendiente = useEliminacionPendiente(repositorio);

  const guardarPerfil = useGuardarPerfil(repositorio);
  const guardarAjustes = useGuardarAjustes(repositorio);
  const revocar = useRevocarDispositivo(repositorio);
  const solicitar = useSolicitarEliminacion(repositorio);
  const cancelar = useCancelarEliminacion(repositorio);

  const volver = (): void => setVista('portada');
  const conAhora = ahora === undefined ? {} : { ahora };

  if (vista === 'editar') {
    return (
      <PantallaEditarPerfil
        perfil={perfil.data ?? null}
        guardando={guardarPerfil.isPending}
        alGuardar={async (borrador: BorradorPerfil) => {
          await guardarPerfil.mutateAsync(borrador);
          volver();
        }}
        alCancelar={volver}
      />
    );
  }

  if (vista === 'configuracion') {
    return (
      <PantallaConfiguracion
        ajustes={ajustes.data ?? AJUSTES_POR_DEFECTO}
        cargando={ajustes.isPending}
        guardando={guardarAjustes.isPending}
        error={errorAjustes}
        alCambiar={(cambio) => {
          setErrorAjustes(null);
          guardarAjustes.mutate(cambio, {
            // Un fallo al encender la biometría no puede quedar en silencio:
            // el interruptor volvería a su sitio y parecería un error de la
            // aplicación en vez de un dispositivo sin huella configurada.
            onError: (causa) =>
              setErrorAjustes(esErrorApp(causa) ? causa.claveMensaje : 'errores.generico'),
          });
        }}
        alVolver={volver}
      />
    );
  }

  if (vista === 'suscripcion') {
    return <SuscripcionContenedor />;
  }

  if (vista === 'exportar') {
    return <ExportarContenedor />;
  }

  if (vista === 'dispositivos') {
    return (
      <PantallaDispositivos
        dispositivos={dispositivos.data ?? []}
        cargando={dispositivos.isPending}
        revocando={revocar.isPending}
        alRevocar={(id) => revocar.mutate(id)}
        alVolver={volver}
      />
    );
  }

  if (vista === 'eliminar') {
    return (
      <PantallaEliminarCuenta
        pendiente={pendiente.data ?? null}
        confirmando={confirmandoBorrado}
        trabajando={solicitar.isPending || cancelar.isPending}
        alPedirConfirmacion={() => setConfirmandoBorrado(true)}
        alConfirmar={() =>
          solicitar.mutate(undefined, { onSuccess: () => setConfirmandoBorrado(false) })
        }
        alCancelarConfirmacion={() => setConfirmandoBorrado(false)}
        alCancelarEliminacion={(solicitudId) => cancelar.mutate(solicitudId)}
        alVolver={volver}
        {...conAhora}
      />
    );
  }

  return (
    <PantallaPerfil
      perfil={perfil.data ?? null}
      correo={correo}
      eliminacionPendiente={pendiente.data ?? null}
      cargando={perfil.isPending}
      alEditar={() => setVista('editar')}
      alAbrirConfiguracion={() => setVista('configuracion')}
      alAbrirDispositivos={() => setVista('dispositivos')}
      alAbrirEliminacion={() => setVista('eliminar')}
      alAbrirExportacion={() => setVista('exportar')}
      alAbrirSuscripcion={() => setVista('suscripcion')}
      alCerrarSesion={() => alCerrarSesion?.()}
      {...conAhora}
    />
  );
}
