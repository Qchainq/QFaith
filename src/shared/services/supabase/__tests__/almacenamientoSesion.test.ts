// El almacenamiento de la sesión guarda tokens: si se trocea mal, el usuario
// aparece desconectado cada vez que abre la aplicación, o peor, quedan restos
// de una sesión anterior legibles en el almacén.
import * as AlmacenSeguro from 'expo-secure-store';

import { almacenamientoSesionSegura } from '../almacenamientoSesion';

const CLAVE = 'sb-proyecto-auth-token';

// El doble de `expo-secure-store` expone su mapa para poder mirar por dentro.
const almacenInterno = (AlmacenSeguro as unknown as { __almacen: Map<string, string> }).__almacen;

beforeEach(() => {
  almacenInterno.clear();
});

describe('almacenamiento seguro de la sesión', () => {
  it('devuelve null cuando no hay nada guardado', async () => {
    await expect(almacenamientoSesionSegura.getItem(CLAVE)).resolves.toBeNull();
  });

  it('conserva un valor corto tal cual', async () => {
    await almacenamientoSesionSegura.setItem(CLAVE, 'sesion-breve');
    await expect(almacenamientoSesionSegura.getItem(CLAVE)).resolves.toBe('sesion-breve');
  });

  it('trocea los valores que superan el límite del almacén seguro', async () => {
    // Una sesión de Supabase real ronda este tamaño: el JWT lleva las
    // reclamaciones y el usuario completo.
    const sesion = 'x'.repeat(5000);
    await almacenamientoSesionSegura.setItem(CLAVE, sesion);

    const trozos = [...almacenInterno.keys()].filter((clave) => /\.\d+$/.test(clave));
    expect(trozos.length).toBeGreaterThan(1);
    trozos.forEach((clave) => {
      expect((almacenInterno.get(clave) ?? '').length).toBeLessThanOrEqual(2048);
    });

    await expect(almacenamientoSesionSegura.getItem(CLAVE)).resolves.toBe(sesion);
  });

  it('no deja restos cuando el valor nuevo es más corto que el anterior', async () => {
    await almacenamientoSesionSegura.setItem(CLAVE, 'y'.repeat(6000));
    await almacenamientoSesionSegura.setItem(CLAVE, 'corta');

    await expect(almacenamientoSesionSegura.getItem(CLAVE)).resolves.toBe('corta');
    // Ningún trozo puede seguir conteniendo material de la sesión anterior.
    [...almacenInterno.values()].forEach((valor) => {
      expect(valor).not.toContain('yyyy');
    });
  });

  it('descarta el valor entero si falta un trozo', async () => {
    await almacenamientoSesionSegura.setItem(CLAVE, 'z'.repeat(5000));
    // Simula un guardado interrumpido o un almacén dañado.
    almacenInterno.delete(`${CLAVE}.1`);

    // Media sesión es peor que ninguna: el cliente creería tener
    // credenciales válidas y fallaría en cada petición.
    await expect(almacenamientoSesionSegura.getItem(CLAVE)).resolves.toBeNull();
    expect(almacenInterno.size).toBe(0);
  });

  it('borra todos los trozos al eliminar', async () => {
    await almacenamientoSesionSegura.setItem(CLAVE, 'w'.repeat(7000));
    await almacenamientoSesionSegura.removeItem(CLAVE);

    expect(almacenInterno.size).toBe(0);
    await expect(almacenamientoSesionSegura.getItem(CLAVE)).resolves.toBeNull();
  });

  it('guarda con la opción que impide que la sesión viaje en una copia del sistema', async () => {
    await almacenamientoSesionSegura.setItem(CLAVE, 'sesion');

    expect(AlmacenSeguro.setItemAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        keychainAccessible: AlmacenSeguro.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    );
  });

  it('normaliza claves con caracteres que el almacén seguro no admite', async () => {
    await almacenamientoSesionSegura.setItem('sb:proyecto/auth token', 'valor');
    [...almacenInterno.keys()].forEach((clave) => {
      expect(clave).toMatch(/^[A-Za-z0-9._-]+$/);
    });
    await expect(almacenamientoSesionSegura.getItem('sb:proyecto/auth token')).resolves.toBe(
      'valor',
    );
  });
});
