// Acceso al almacén seguro del sistema operativo (Keychain en iOS, Keystore
// en Android). Es el único lugar donde puede reposar la clave maestra en el
// dispositivo.
//
// Nunca usar `AsyncStorage` ni almacenamiento normal para material de clave:
// no está cifrado y es legible en un dispositivo comprometido.
import * as AutenticacionLocal from 'expo-local-authentication';
import * as AlmacenSeguro from 'expo-secure-store';

import { ErrorApp } from '@shared/errores/erroresApp';

const CLAVE_MAESTRA = 'qfaith.clave_maestra';

/**
 * Opciones de almacenamiento.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` impide que el valor viaje en una copia de
 * seguridad del sistema a otro dispositivo: la clave maestra solo puede
 * llegar a un dispositivo nuevo por el camino que hemos diseñado, que es la
 * frase de recuperación.
 */
const OPCIONES = {
  keychainAccessible: AlmacenSeguro.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

export interface EstadoBiometria {
  readonly disponible: boolean;
  readonly configurada: boolean;
}

export async function consultarBiometria(): Promise<EstadoBiometria> {
  const [disponible, configurada] = await Promise.all([
    AutenticacionLocal.hasHardwareAsync(),
    AutenticacionLocal.isEnrolledAsync(),
  ]);
  return { disponible, configurada };
}

/**
 * Pide confirmación biométrica.
 *
 * Solo desbloquea la clave que ya está en el dispositivo: no autentica
 * contra el servidor ni sustituye al cifrado.
 */
export async function pedirDesbloqueoBiometrico(motivo: string): Promise<boolean> {
  const estado = await consultarBiometria();
  if (!estado.disponible || !estado.configurada) {
    // Sin biometría configurada la aplicación sigue siendo usable; el
    // bloqueo recae en el PIN del sistema.
    return true;
  }
  const resultado = await AutenticacionLocal.authenticateAsync({
    promptMessage: motivo,
    disableDeviceFallback: false,
  });
  return resultado.success;
}

export async function guardarClaveMaestra(claveMaestraBase64: string): Promise<void> {
  try {
    await AlmacenSeguro.setItemAsync(CLAVE_MAESTRA, claveMaestraBase64, OPCIONES);
  } catch (causa) {
    throw new ErrorApp(
      {
        codigo: 'ALMACEN_SEGURO_NO_DISPONIBLE',
        categoria: 'cifrado',
        claveMensaje: 'errores.cifrado.claveInvalida',
        puedeReintentarse: true,
      },
      causa,
    );
  }
}

export async function leerClaveMaestra(): Promise<string | null> {
  return AlmacenSeguro.getItemAsync(CLAVE_MAESTRA, OPCIONES);
}

export async function borrarClaveMaestra(): Promise<void> {
  await AlmacenSeguro.deleteItemAsync(CLAVE_MAESTRA, OPCIONES);
}
