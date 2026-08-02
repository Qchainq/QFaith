// Registro del dispositivo.
//
// Cada cambio que se sincroniza queda atribuido a un dispositivo, y la
// columna que lo guarda es una clave ajena a `devices`. Un identificador
// inventado por el cliente no vale: el servidor lo rechaza. Así que antes de
// sincronizar por primera vez hay que dar de alta el dispositivo y quedarse
// con el UUID que asigna el servidor.
//
// Esto no es burocracia: es lo que permite al usuario ver qué dispositivos
// tienen acceso a su cuenta y revocar uno perdido (Documento 5). Aquí solo se
// guarda lo imprescindible para reconocerlo. **Nunca identificadores
// publicitarios ni nada que sirva para rastrear a la persona.**
import * as AlmacenSeguro from 'expo-secure-store';

import { generarUuid } from '@shared/services/crypto/aleatoriedad';

import type { ClienteRest } from './rest';

const IDENTIFICADOR_INSTALACION = 'qfaith.identificador_dispositivo';

export type Plataforma = 'ios' | 'android' | 'web';

interface FilaDispositivo {
  readonly id: string;
}

/**
 * Identificador estable de esta instalación.
 *
 * Se genera al azar la primera vez y se guarda en el dispositivo. No procede
 * de ningún identificador del sistema operativo: dos instalaciones de la
 * misma persona en el mismo teléfono son dispositivos distintos, y
 * desinstalar borra el rastro.
 */
export async function identificadorDeInstalacion(): Promise<string> {
  const guardado = await AlmacenSeguro.getItemAsync(IDENTIFICADOR_INSTALACION);
  if (guardado !== null) {
    return guardado;
  }
  const nuevo = generarUuid();
  await AlmacenSeguro.setItemAsync(IDENTIFICADOR_INSTALACION, nuevo);
  return nuevo;
}

/**
 * Da de alta el dispositivo si hace falta y devuelve su UUID.
 *
 * Es idempotente: la tabla tiene una restricción única por
 * (usuario, identificador público), así que repetirlo no crea duplicados
 * aunque la respuesta anterior se perdiera.
 */
export async function asegurarDispositivo(parametros: {
  readonly rest: ClienteRest;
  readonly usuarioId: string;
  readonly identificadorPublico: string;
  readonly plataforma: Plataforma;
  readonly nombre?: string;
}): Promise<string> {
  const respuesta = await parametros.rest.peticion<FilaDispositivo>({
    metodo: 'POST',
    ruta: '/devices?on_conflict=user_id,device_public_id&select=id',
    cuerpo: {
      user_id: parametros.usuarioId,
      device_public_id: parametros.identificadorPublico,
      platform: parametros.plataforma,
      ...(parametros.nombre === undefined ? {} : { device_name: parametros.nombre }),
      last_seen_at: new Date().toISOString(),
    },
    prefer: 'resolution=merge-duplicates,return=representation',
  });

  if (respuesta.estado >= 400) {
    throw parametros.rest.comoError(respuesta, 'registrar:devices');
  }

  const fila = respuesta.filas[0];
  if (fila === undefined) {
    throw parametros.rest.comoError(
      { estado: respuesta.estado, filas: [], codigo: 'SIN_FILA' },
      'registrar:devices',
    );
  }
  return fila.id;
}
