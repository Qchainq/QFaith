// El orden en que se hacen las cosas al crear una cuenta es lo que decide si
// el usuario puede recuperarla luego. Estas pruebas fijan ese orden y los
// caminos de vuelta cuando algo falla a mitad.
import { esErrorApp } from '@shared/errores/erroresApp';

import {
  crearCuenta,
  entrarConCuenta,
  reanudarSesion,
  restaurarCuenta,
  olvidarEsteDispositivo,
  salir,
} from '../accesoACuenta';

const mockAuth = {
  registrar: jest.fn(),
  iniciarSesion: jest.fn(),
  cerrarSesion: jest.fn(),
  sesionActual: jest.fn(),
  tokenAcceso: jest.fn(),
};

const mockClaves = {
  inicializarCuenta: jest.fn(),
  desbloquear: jest.fn(),
  restaurarConFrase: jest.fn(),
  olvidarDispositivo: jest.fn(),
};

const mockRepositorioClaves = {
  subirMaterialCuenta: jest.fn(),
  descargarMaterialCuenta: jest.fn(),
};

const mockDispositivos = {
  asegurarDispositivo: jest.fn(),
  identificadorDeInstalacion: jest.fn(),
};

jest.mock('@shared/services/auth/servicioAutenticacion', () => ({
  registrar: (...args: never[]) => mockAuth.registrar(...args),
  iniciarSesion: (...args: never[]) => mockAuth.iniciarSesion(...args),
  cerrarSesion: (...args: never[]) => mockAuth.cerrarSesion(...args),
  sesionActual: (...args: never[]) => mockAuth.sesionActual(...args),
  tokenAcceso: (...args: never[]) => mockAuth.tokenAcceso(...args),
}));

jest.mock('@shared/services/keys/servicioClaves', () => ({
  inicializarCuenta: (...args: never[]) => mockClaves.inicializarCuenta(...args),
  desbloquear: (...args: never[]) => mockClaves.desbloquear(...args),
  restaurarConFrase: (...args: never[]) => mockClaves.restaurarConFrase(...args),
  olvidarDispositivo: (...args: never[]) => mockClaves.olvidarDispositivo(...args),
}));

jest.mock('@shared/services/supabase/repositorioClaves', () => ({
  subirMaterialCuenta: (...args: never[]) => mockRepositorioClaves.subirMaterialCuenta(...args),
  descargarMaterialCuenta: (...args: never[]) =>
    mockRepositorioClaves.descargarMaterialCuenta(...args),
}));

jest.mock('@shared/services/supabase/repositorioDispositivos', () => ({
  asegurarDispositivo: (...args: never[]) => mockDispositivos.asegurarDispositivo(...args),
  identificadorDeInstalacion: (...args: never[]) =>
    mockDispositivos.identificadorDeInstalacion(...args),
}));

const USUARIO = { id: 'usuario-1', correo: 'persona@ejemplo.test' };
const CREDENCIALES = { correo: 'persona@ejemplo.test', contrasena: 'contrasena-larga' };
const DEPENDENCIAS = { plataforma: 'ios' as const, rest: {} as never };

const MATERIAL = {
  fraseRecuperacion: Array.from({ length: 24 }, (_, i) => `palabra${i}`).join(' '),
  sobreRecuperacion: { envoltorioBase64: 'sobre', nonceBase64: 'nonce' },
  sobresClaves: [{ keyId: 'k1', dominio: 'diario' }],
};

beforeEach(() => {
  mockAuth.tokenAcceso.mockResolvedValue('token');
  mockDispositivos.asegurarDispositivo.mockResolvedValue('uuid-del-dispositivo');
  mockDispositivos.identificadorDeInstalacion.mockResolvedValue('instalacion-1');
});

describe('crear cuenta', () => {
  it('sube el material y devuelve la frase para mostrarla una única vez', async () => {
    mockAuth.registrar.mockResolvedValue({ usuario: USUARIO, conSesion: true });
    mockClaves.inicializarCuenta.mockResolvedValue(MATERIAL);
    mockRepositorioClaves.subirMaterialCuenta.mockResolvedValue(undefined);

    const paso = await crearCuenta(DEPENDENCIAS, CREDENCIALES);

    expect(paso).toEqual({
      tipo: 'mostrarFrase',
      usuario: USUARIO,
      frase: MATERIAL.fraseRecuperacion,
    });
    expect(mockRepositorioClaves.subirMaterialCuenta).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: USUARIO.id }),
    );
  });

  it('no genera claves si el proyecto exige confirmar el correo', async () => {
    // Sin sesión no hay token, y sin token no se pueden subir los sobres.
    // Generar la clave maestra aquí dejaría al usuario con una cuenta que no
    // podría recuperar en ningún otro dispositivo.
    mockAuth.registrar.mockResolvedValue({ usuario: USUARIO, conSesion: false });

    const paso = await crearCuenta(DEPENDENCIAS, CREDENCIALES);

    expect(paso).toEqual({ tipo: 'confirmarCorreo' });
    expect(mockClaves.inicializarCuenta).not.toHaveBeenCalled();
  });

  it('deshace las claves locales si el material no llega al servidor', async () => {
    mockAuth.registrar.mockResolvedValue({ usuario: USUARIO, conSesion: true });
    mockClaves.inicializarCuenta.mockResolvedValue(MATERIAL);
    mockRepositorioClaves.subirMaterialCuenta.mockRejectedValue(new Error('sin red'));

    await expect(crearCuenta(DEPENDENCIAS, CREDENCIALES)).rejects.toThrow('sin red');

    // Una clave maestra en el dispositivo sin su sobre en el servidor es una
    // cuenta irrecuperable en cuanto se pierda el teléfono.
    expect(mockClaves.olvidarDispositivo).toHaveBeenCalled();
  });

  it('la identidad se crea antes que las claves', async () => {
    const orden: string[] = [];
    mockAuth.registrar.mockImplementation(async () => {
      orden.push('registrar');
      return { usuario: USUARIO, conSesion: true };
    });
    mockClaves.inicializarCuenta.mockImplementation(async () => {
      orden.push('claves');
      return MATERIAL;
    });
    mockRepositorioClaves.subirMaterialCuenta.mockImplementation(async () => {
      orden.push('subir');
    });

    await crearCuenta(DEPENDENCIAS, CREDENCIALES);

    expect(orden).toEqual(['registrar', 'claves', 'subir']);
  });
});

describe('entrar con una cuenta existente', () => {
  it('abre la sesión cuando este dispositivo ya tiene la clave', async () => {
    mockAuth.iniciarSesion.mockResolvedValue({ usuario: USUARIO, conSesion: true });
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: MATERIAL.sobresClaves,
      sobreRecuperacion: MATERIAL.sobreRecuperacion,
    });
    mockClaves.desbloquear.mockResolvedValue(true);

    await expect(entrarConCuenta(DEPENDENCIAS, CREDENCIALES)).resolves.toEqual({
      tipo: 'listo',
      usuario: USUARIO,
    });
  });

  it('pide la frase en una instalación nueva', async () => {
    // La contraseña abre la cuenta, pero no descifra nada: la clave maestra
    // no se deriva de ella y solo puede llegar aquí por la frase.
    mockAuth.iniciarSesion.mockResolvedValue({ usuario: USUARIO, conSesion: true });
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: MATERIAL.sobresClaves,
      sobreRecuperacion: MATERIAL.sobreRecuperacion,
    });
    mockClaves.desbloquear.mockResolvedValue(false);

    await expect(entrarConCuenta(DEPENDENCIAS, CREDENCIALES)).resolves.toEqual({
      tipo: 'restaurarConFrase',
      usuario: USUARIO,
    });
  });

  it('da de alta el dispositivo para que los cambios queden atribuidos', async () => {
    mockAuth.iniciarSesion.mockResolvedValue({ usuario: USUARIO, conSesion: true });
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: [],
      sobreRecuperacion: null,
    });
    mockClaves.desbloquear.mockResolvedValue(true);

    await entrarConCuenta(DEPENDENCIAS, CREDENCIALES);

    expect(mockDispositivos.asegurarDispositivo).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: USUARIO.id, plataforma: 'ios' }),
    );
  });
});

describe('restaurar', () => {
  it('restaura con la frase y deja la sesión lista', async () => {
    mockAuth.sesionActual.mockResolvedValue(USUARIO);
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: MATERIAL.sobresClaves,
      sobreRecuperacion: MATERIAL.sobreRecuperacion,
    });

    await expect(restaurarCuenta(DEPENDENCIAS, 'las veinticuatro palabras')).resolves.toEqual({
      tipo: 'listo',
      usuario: USUARIO,
    });
    expect(mockClaves.restaurarConFrase).toHaveBeenCalledWith(
      expect.objectContaining({ frase: 'las veinticuatro palabras' }),
    );
  });

  it('no intenta restaurar sin sesión', async () => {
    mockAuth.sesionActual.mockResolvedValue(null);

    await expect(restaurarCuenta(DEPENDENCIAS, 'frase')).resolves.toEqual({ tipo: 'sinSesion' });
    expect(mockClaves.restaurarConFrase).not.toHaveBeenCalled();
  });

  it('falla claro si la cuenta no tiene configuración de recuperación', async () => {
    mockAuth.sesionActual.mockResolvedValue(USUARIO);
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: [],
      sobreRecuperacion: null,
    });

    await restaurarCuenta(DEPENDENCIAS, 'frase').catch((error: unknown) => {
      expect(esErrorApp(error)).toBe(true);
      if (!esErrorApp(error)) return;
      expect(error.codigo).toBe('SIN_CONFIGURACION_RECUPERACION');
    });
    expect.hasAssertions();
    expect(mockClaves.restaurarConFrase).not.toHaveBeenCalled();
  });
});

describe('reanudar al abrir la aplicación', () => {
  it('sin sesión guardada no pide nada al servidor', async () => {
    mockAuth.sesionActual.mockResolvedValue(null);

    await expect(reanudarSesion(DEPENDENCIAS)).resolves.toEqual({ tipo: 'sinSesion' });
    expect(mockRepositorioClaves.descargarMaterialCuenta).not.toHaveBeenCalled();
  });

  it('con sesión y clave en el dispositivo, entra directo', async () => {
    mockAuth.sesionActual.mockResolvedValue(USUARIO);
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: MATERIAL.sobresClaves,
      sobreRecuperacion: MATERIAL.sobreRecuperacion,
    });
    mockClaves.desbloquear.mockResolvedValue(true);

    await expect(reanudarSesion(DEPENDENCIAS)).resolves.toEqual({
      tipo: 'listo',
      usuario: USUARIO,
    });
  });

  it('con sesión pero sin clave, manda a restaurar', async () => {
    mockAuth.sesionActual.mockResolvedValue(USUARIO);
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: [],
      sobreRecuperacion: MATERIAL.sobreRecuperacion,
    });
    mockClaves.desbloquear.mockResolvedValue(false);

    await expect(reanudarSesion(DEPENDENCIAS)).resolves.toMatchObject({
      tipo: 'restaurarConFrase',
    });
  });
});

describe('salida', () => {
  it('cerrar sesión no borra la clave del dispositivo', async () => {
    await salir();

    expect(mockAuth.cerrarSesion).toHaveBeenCalled();
    // Volver a entrar no debería obligar a escribir las 24 palabras.
    expect(mockClaves.olvidarDispositivo).not.toHaveBeenCalled();
  });

  it('olvidar el dispositivo sí borra la clave antes de cerrar sesión', async () => {
    await olvidarEsteDispositivo();

    expect(mockClaves.olvidarDispositivo).toHaveBeenCalled();
    expect(mockAuth.cerrarSesion).toHaveBeenCalled();
  });
});
