// El almacén seguro es el único sitio donde reposa la clave maestra en el
// dispositivo. Estas pruebas fijan sus garantías: dónde se guarda, con qué
// protección y qué ocurre cuando el sistema no coopera.
import * as AutenticacionLocal from 'expo-local-authentication';
import * as AlmacenSeguro from 'expo-secure-store';

import {
  borrarClaveMaestra,
  consultarBiometria,
  guardarClaveMaestra,
  leerClaveMaestra,
  pedirDesbloqueoBiometrico,
} from '../almacenSeguro';

const CLAVE_FICTICIA = 'Y2xhdmUtZGUtcHJ1ZWJhLW5vLXJlYWw=';

beforeEach(() => {
  (AlmacenSeguro as unknown as { __almacen: Map<string, string> }).__almacen.clear();
});

describe('almacenamiento de la clave maestra', () => {
  it('guarda y recupera la clave', async () => {
    await guardarClaveMaestra(CLAVE_FICTICIA);
    expect(await leerClaveMaestra()).toBe(CLAVE_FICTICIA);
  });

  it('la marca para que no salga de este dispositivo en una copia del sistema', async () => {
    await guardarClaveMaestra(CLAVE_FICTICIA);

    expect(AlmacenSeguro.setItemAsync).toHaveBeenCalledWith(
      'qfaith.clave_maestra',
      CLAVE_FICTICIA,
      { keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' },
    );
  });

  it('devuelve null en un dispositivo que todavía no tiene clave', async () => {
    expect(await leerClaveMaestra()).toBeNull();
  });

  it('borrarla deja el dispositivo sin clave', async () => {
    await guardarClaveMaestra(CLAVE_FICTICIA);
    await borrarClaveMaestra();

    expect(await leerClaveMaestra()).toBeNull();
  });

  it('si el almacén seguro falla, el error es reintentable y no expone la clave', async () => {
    jest
      .mocked(AlmacenSeguro.setItemAsync)
      .mockRejectedValueOnce(new Error('keychain no disponible'));

    await expect(guardarClaveMaestra(CLAVE_FICTICIA)).rejects.toThrow(
      expect.objectContaining({ codigo: 'ALMACEN_SEGURO_NO_DISPONIBLE', puedeReintentarse: true }),
    );

    try {
      jest
        .mocked(AlmacenSeguro.setItemAsync)
        .mockRejectedValueOnce(new Error('keychain no disponible'));
      await guardarClaveMaestra(CLAVE_FICTICIA);
    } catch (error) {
      const registro = JSON.stringify((error as { aRegistroSeguro(): unknown }).aRegistroSeguro());
      expect(registro).not.toContain(CLAVE_FICTICIA);
    }
  });
});

describe('biometría', () => {
  it('informa de si el dispositivo la tiene y está configurada', async () => {
    expect(await consultarBiometria()).toEqual({ disponible: true, configurada: true });
  });

  it('pide confirmación cuando está configurada', async () => {
    const abierto = await pedirDesbloqueoBiometrico('Desbloquea QFaith');

    expect(abierto).toBe(true);
    expect(AutenticacionLocal.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ promptMessage: 'Desbloquea QFaith' }),
    );
  });

  it('deja pasar cuando el dispositivo no tiene biometría, sin bloquear la aplicación', async () => {
    jest.mocked(AutenticacionLocal.hasHardwareAsync).mockResolvedValueOnce(false);

    expect(await pedirDesbloqueoBiometrico('motivo')).toBe(true);
    expect(AutenticacionLocal.authenticateAsync).not.toHaveBeenCalled();
  });

  it('deja pasar cuando hay hardware pero el usuario no la ha configurado', async () => {
    jest.mocked(AutenticacionLocal.isEnrolledAsync).mockResolvedValueOnce(false);

    expect(await pedirDesbloqueoBiometrico('motivo')).toBe(true);
    expect(AutenticacionLocal.authenticateAsync).not.toHaveBeenCalled();
  });

  it('devuelve falso si el usuario cancela o no se le reconoce', async () => {
    jest
      .mocked(AutenticacionLocal.authenticateAsync)
      .mockResolvedValueOnce({ success: false, error: 'user_cancel' });

    expect(await pedirDesbloqueoBiometrico('motivo')).toBe(false);
  });

  it('permite recurrir al PIN del sistema en lugar de forzar la biometría', async () => {
    await pedirDesbloqueoBiometrico('motivo');

    expect(AutenticacionLocal.authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: false }),
    );
  });
});
