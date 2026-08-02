// Almacenamiento de la sesión de Supabase.
//
// El cliente de Supabase guarda por defecto el token de acceso y el de
// refresco en almacenamiento normal, que en un dispositivo comprometido se
// lee sin esfuerzo. Un token de refresco robado vale tanto como la
// contraseña: permite emitir tokens de acceso nuevos indefinidamente. Aquí
// van al almacén seguro del sistema, igual que la clave maestra.
//
// Ojo con el tamaño: `expo-secure-store` no garantiza valores por encima de
// 2048 bytes y una sesión de Supabase los supera con facilidad, porque el JWT
// lleva las reclamaciones y el usuario completo. Por eso se trocea. Sin esto,
// el guardado falla justo en los dispositivos donde más importa y el usuario
// aparece desconectado cada vez que abre la aplicación.
import * as AlmacenSeguro from 'expo-secure-store';

/** Margen holgado por debajo del límite que documenta expo-secure-store. */
const TAMANO_TROZO = 1800;

const OPCIONES = {
  keychainAccessible: AlmacenSeguro.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} as const;

/**
 * Interfaz que espera el cliente de Supabase. Se declara aquí para no
 * depender de sus tipos internos.
 */
export interface AlmacenamientoSesion {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
  removeItem(clave: string): Promise<void>;
}

/**
 * `expo-secure-store` solo admite letras, números, punto, guion y guion bajo
 * en las claves. Las de Supabase llevan otros caracteres, así que se
 * normalizan de forma estable.
 */
function normalizar(clave: string): string {
  return clave.replace(/[^A-Za-z0-9._-]/g, '_');
}

const claveTrozo = (clave: string, indice: number): string => `${normalizar(clave)}.${indice}`;
const claveRecuento = (clave: string): string => `${normalizar(clave)}.n`;

async function borrarTrozos(clave: string, desde: number, hasta: number): Promise<void> {
  const borrados: Promise<void>[] = [];
  for (let indice = desde; indice < hasta; indice += 1) {
    borrados.push(AlmacenSeguro.deleteItemAsync(claveTrozo(clave, indice), OPCIONES));
  }
  await Promise.all(borrados);
}

async function leerRecuento(clave: string): Promise<number> {
  const bruto = await AlmacenSeguro.getItemAsync(claveRecuento(clave), OPCIONES);
  if (bruto === null) {
    return 0;
  }
  const recuento = Number.parseInt(bruto, 10);
  return Number.isSafeInteger(recuento) && recuento >= 0 ? recuento : 0;
}

export const almacenamientoSesionSegura: AlmacenamientoSesion = {
  async getItem(clave) {
    const recuento = await leerRecuento(clave);
    if (recuento === 0) {
      return null;
    }

    const trozos = await Promise.all(
      Array.from({ length: recuento }, (_, indice) =>
        AlmacenSeguro.getItemAsync(claveTrozo(clave, indice), OPCIONES),
      ),
    );

    // Si falta un trozo, el valor está corrupto. Devolver una sesión a medias
    // sería peor que no devolver nada: el cliente creería tener credenciales
    // válidas. Se descarta entera y el usuario vuelve a identificarse.
    if (trozos.some((trozo) => trozo === null)) {
      await this.removeItem(clave);
      return null;
    }

    return trozos.join('');
  },

  async setItem(clave, valor) {
    const recuentoAnterior = await leerRecuento(clave);

    const trozos: string[] = [];
    for (let inicio = 0; inicio < valor.length; inicio += TAMANO_TROZO) {
      trozos.push(valor.slice(inicio, inicio + TAMANO_TROZO));
    }
    // Un valor vacío sigue siendo un valor: se guarda como un único trozo
    // vacío para distinguirlo de «no hay nada».
    if (trozos.length === 0) {
      trozos.push('');
    }

    await Promise.all(
      trozos.map((trozo, indice) =>
        AlmacenSeguro.setItemAsync(claveTrozo(clave, indice), trozo, OPCIONES),
      ),
    );
    // El recuento se escribe al final: hasta que no están todos los trozos,
    // una lectura concurrente debe ver el valor anterior, no uno a medias.
    await AlmacenSeguro.setItemAsync(claveRecuento(clave), String(trozos.length), OPCIONES);

    // Si el valor nuevo ocupa menos, los trozos sobrantes contienen material
    // de sesión antiguo y no pueden quedarse ahí.
    await borrarTrozos(clave, trozos.length, recuentoAnterior);
  },

  async removeItem(clave) {
    const recuento = await leerRecuento(clave);
    await AlmacenSeguro.deleteItemAsync(claveRecuento(clave), OPCIONES);
    await borrarTrozos(clave, 0, recuento);
  },
};
