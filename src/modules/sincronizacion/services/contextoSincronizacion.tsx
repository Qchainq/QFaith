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
import {
  crearMotorSincronizacion,
  type MotorSincronizacion,
} from '@shared/services/sync/motorSincronizacion';
import { configuracion } from '@shared/constants/configuracion';

export interface Sincronizacion {
  readonly motor: MotorSincronizacion;
  readonly almacen: AlmacenLocal;
  readonly usuarioId: string;
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
