// Raíz de composición de la sincronización.
//
// Es el único sitio donde se juntan las tres piezas que hasta ahora vivían
// separadas: la base local cifrada, el puerto contra Supabase y el motor. Los
// módulos no las construyen; piden el motor a este contexto.
//
// Se monta **solo cuando hay sesión abierta**. Antes de eso no hay usuario al
// que atribuir los registros ni claves con las que descifrarlos, y una base
// local a medio abrir sería peor que ninguna.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { crearAlmacenSqlite } from '@shared/database/almacenSqlite';
import type { AlmacenLocal } from '@shared/database/tipos';
import { crearEjecutorExpo } from '@shared/database/ejecutorExpo';
import { tokenAcceso } from '@shared/services/auth/servicioAutenticacion';
import { crearPuertoRemotoSupabase } from '@shared/services/supabase/puertoRemotoSupabase';
import { crearAlmacenamientoSupabase } from '@shared/services/storage/almacenamientoSupabase';
import { crearAlmacenamientoDeArchivos } from '@shared/services/storage/almacenamientoExpo';
import { crearSistemaDeArchivosExpo } from '@shared/services/storage/sistemaDeArchivosExpo';
import type {
  AlmacenamientoLocal,
  AlmacenamientoRemoto,
} from '@shared/services/storage/puertoAlmacenamiento';
import {
  crearMotorSincronizacion,
  type MotorSincronizacion,
} from '@shared/services/sync/motorSincronizacion';
import { configuracion } from '@shared/constants/configuracion';

import { crearRepositorioArchivos } from '@modules/archivos/repositories/repositorioArchivos';
import { claveDeDominio, clavesDerivadas } from '@shared/services/keys/servicioClaves';

import { sincronizarConEstado } from '../use-cases/sincronizarConEstado';

export interface Sincronizacion {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
  /**
   * El cubo y la copia en disco de los archivos privados.
   *
   * Viven aquí y no en el módulo de archivos porque son de sesión, como el
   * motor: cambian con el usuario y se abren una sola vez. Un módulo que los
   * construyera por su cuenta acabaría con dos cachés del mismo archivo.
   */
  readonly almacenamientoRemoto: AlmacenamientoRemoto;
  readonly almacenamientoLocal: AlmacenamientoLocal;
}

const Contexto = createContext<Sincronizacion | null>(null);

export interface PropsProveedorSincronizacion {
  readonly usuarioId: string;
  readonly dispositivoId: string;
  readonly children: ReactNode;
  /** Inyectable para las pruebas: evita depender de SQLite y de la red. */
  readonly construir?: (parametros: {
    readonly usuarioId: string;
    readonly dispositivoId: string;
  }) => Promise<Sincronizacion>;
  /** Qué mostrar mientras la base local se abre. */
  readonly mientrasCarga?: ReactNode;
  /**
   * Sincronizar sola, al montar y cada intervalo.
   *
   * Se puede apagar en las pruebas de módulo: allí lo que se comprueba es la
   * pantalla, y un temporizador de fondo dejaría trabajo pendiente al
   * terminar cada caso.
   */
  readonly sincronizarEnSegundoPlano?: boolean;
}

async function construirPorDefecto(parametros: {
  readonly usuarioId: string;
  readonly dispositivoId: string;
}): Promise<Sincronizacion> {
  const almacen = await crearAlmacenSqlite(await crearEjecutorExpo());
  const remoto = crearPuertoRemotoSupabase({
    proveerToken: tokenAcceso,
    usuarioId: parametros.usuarioId,
  });
  return {
    almacen,
    usuarioId: parametros.usuarioId,
    almacenamientoRemoto: crearAlmacenamientoSupabase({ proveerToken: tokenAcceso }),
    almacenamientoLocal: crearAlmacenamientoDeArchivos(crearSistemaDeArchivosExpo()),
    motor: crearMotorSincronizacion({
      almacen,
      remoto,
      usuarioId: parametros.usuarioId,
      dispositivoId: parametros.dispositivoId,
      tamanoLote: configuracion.sincronizacion.tamanoLote,
    }),
  };
}

export function ProveedorSincronizacion({
  usuarioId,
  dispositivoId,
  children,
  construir = construirPorDefecto,
  mientrasCarga = null,
  sincronizarEnSegundoPlano = true,
}: PropsProveedorSincronizacion) {
  const [sincronizacion, setSincronizacion] = useState<Sincronizacion | null>(null);

  useEffect(() => {
    let vigente = true;
    setSincronizacion(null);

    void (async () => {
      const construida = await construir({ usuarioId, dispositivoId });
      // Si la sesión cambió mientras se abría la base, esta instancia ya no
      // vale: publicarla mezclaría el contenido de dos cuentas.
      if (vigente) {
        setSincronizacion(construida);
      }
    })();

    return () => {
      vigente = false;
    };
  }, [usuarioId, dispositivoId, construir]);

  // Nada dispara la sincronización si no se hace aquí: el motor sabía
  // sincronizar y nadie se lo pedía, así que los cambios se quedaban en el
  // dispositivo para siempre. Offline-first significa primero local, no solo
  // local.
  //
  // Se lanza al montar y después cada intervalo. Nunca bloquea la interfaz:
  // `sincronizarConEstado` no lanza y el resultado se cuenta en el estado
  // global, que es de donde lee el indicador.
  useEffect(() => {
    if (sincronizacion === null || !sincronizarEnSegundoPlano) return;

    // Los archivos pendientes se suben en la misma vuelta. El repositorio se
    // construye aquí, dentro del efecto, porque necesita las claves de la
    // sesión y estas solo existen con la cuenta desbloqueada.
    const subirArchivosPendientes = async (): Promise<void> => {
      const archivos = crearRepositorioArchivos({
        motor: sincronizacion.motor,
        almacen: sincronizacion.almacen,
        usuarioId: sincronizacion.usuarioId,
        remoto: sincronizacion.almacenamientoRemoto,
        local: sincronizacion.almacenamientoLocal,
        claveMedios: () => claveDeDominio('medios'),
        claveEnvoltorio: () => clavesDerivadas().claveEnvoltorio,
        claveHash: () => clavesDerivadas().claveHash,
      });
      await archivos.subirPendientes();
    };

    let vigente = true;
    const intentar = (): void => {
      if (vigente) {
        void sincronizarConEstado(sincronizacion.motor, undefined, [subirArchivosPendientes]);
      }
    };

    intentar();
    const temporizador = setInterval(intentar, configuracion.sincronizacion.intervaloMs);

    return () => {
      vigente = false;
      clearInterval(temporizador);
    };
  }, [sincronizacion, sincronizarEnSegundoPlano]);

  if (sincronizacion === null) {
    return <>{mientrasCarga}</>;
  }

  return <Contexto.Provider value={sincronizacion}>{children}</Contexto.Provider>;
}

/**
 * Acceso al motor desde un módulo.
 *
 * Falla si no hay proveedor: un repositorio que se cree sin sincronización
 * escribiría en una base que nadie sube, y el usuario perdería sus datos al
 * cambiar de dispositivo sin enterarse.
 */
export function useSincronizacion(): Sincronizacion {
  const sincronizacion = useContext(Contexto);
  if (sincronizacion === null) {
    throw new Error('useSincronizacion fuera de ProveedorSincronizacion');
  }
  return sincronizacion;
}
