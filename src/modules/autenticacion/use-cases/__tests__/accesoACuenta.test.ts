// El orden en que se hacen las cosas al crear una cuenta es lo que decide si
// el usuario puede recuperarla luego. Estas pruebas fijan ese orden y los
// caminos de vuelta cuando algo falla a mitad.
import { esErrorApp } from '@shared/errores/erroresApp';
import type { SobreClavePersistido } from '@shared/services/keys/servicioClaves';

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
  bloquear: jest.fn(),
  inicializarCuenta: jest.fn(),
  desbloquear: jest.fn(),
  restaurarConFrase: jest.fn(),
  olvidarDispositivo: jest.fn(),
  completarClavesDeDominio: jest.fn<readonly SobreClavePersistido[], []>(() => []),
};

const mockRepositorioClaves = {
  subirMaterialCuenta: jest.fn(),
  descargarMaterialCuenta: jest.fn(),
  subirSobresDeClave: jest.fn(),
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
  bloquear: (...args: never[]) => mockClaves.bloquear(...args),
  inicializarCuenta: (...args: never[]) => mockClaves.inicializarCuenta(...args),
  desbloquear: (...args: never[]) => mockClaves.desbloquear(...args),
  restaurarConFrase: (...args: never[]) => mockClaves.restaurarConFrase(...args),
  olvidarDispositivo: (...args: never[]) => mockClaves.olvidarDispositivo(...args),
  completarClavesDeDominio: () => mockClaves.completarClavesDeDominio(),
}));

jest.mock('@shared/services/supabase/repositorioClaves', () => ({
  subirMaterialCuenta: (...args: never[]) => mockRepositorioClaves.subirMaterialCuenta(...args),
  descargarMaterialCuenta: (...args: never[]) =>
    mockRepositorioClaves.descargarMaterialCuenta(...args),
  subirSobresDeClave: (...args: never[]) => mockRepositorioClaves.subirSobresDeClave(...args),
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
      dispositivoId: 'uuid-del-dispositivo',
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
      dispositivoId: 'uuid-del-dispositivo',
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
      dispositivoId: 'uuid-del-dispositivo',
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
      dispositivoId: 'uuid-del-dispositivo',
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
  it('cerrar sesión descarta las claves de memoria pero no las del dispositivo', async () => {
    await salir();

    expect(mockAuth.cerrarSesion).toHaveBeenCalled();
    // Dejar el material vivo en memoria significaría que el contenido privado
    // sigue descifrable en un dispositivo del que su dueño acaba de salir.
    expect(mockClaves.bloquear).toHaveBeenCalled();
    // Pero volver a entrar no debería obligar a escribir las 24 palabras.
    expect(mockClaves.olvidarDispositivo).not.toHaveBeenCalled();
  });

  it('olvidar el dispositivo sí borra la clave antes de cerrar sesión', async () => {
    await olvidarEsteDispositivo();

    expect(mockClaves.olvidarDispositivo).toHaveBeenCalled();
    expect(mockAuth.cerrarSesion).toHaveBeenCalled();
  });
});

describe('dominios de cifrado añadidos después', () => {
  // QFaith añade módulos, y cada uno trae su dominio. Una cuenta creada antes
  // no tiene sobre para el dominio nuevo y ese módulo no podría escribir nada.
  // La clave se crea en el dispositivo —envolverla exige la clave de
  // envoltorio, que no sale de aquí— y su sobre hay que subirlo para que los
  // demás dispositivos también lo tengan.
  const SOBRE_NUEVO: SobreClavePersistido = {
    keyId: 'clave-de-planes',
    dominio: 'planes',
    envoltorioBase64: 'envuelto',
    nonceBase64: 'nonce',
    keyType: 'contenido',
    encryptionMethod: 'xchacha20poly1305',
    keyVersion: 1,
  };

  beforeEach(() => {
    mockAuth.sesionActual.mockResolvedValue(USUARIO);
    mockRepositorioClaves.descargarMaterialCuenta.mockResolvedValue({
      sobresClaves: MATERIAL.sobresClaves,
      sobreRecuperacion: MATERIAL.sobreRecuperacion,
    });
    mockClaves.desbloquear.mockResolvedValue(true);
  });

  it('al reanudar, el sobre nuevo se sube', async () => {
    mockClaves.completarClavesDeDominio.mockReturnValue([SOBRE_NUEVO]);

    await reanudarSesion(DEPENDENCIAS);

    expect(mockRepositorioClaves.subirSobresDeClave).toHaveBeenCalledWith(
      expect.objectContaining({ usuarioId: USUARIO.id, sobresClaves: [SOBRE_NUEVO] }),
    );
  });

  it('al entrar con contraseña también', async () => {
    mockAuth.iniciarSesion.mockResolvedValue({ usuario: USUARIO, conSesion: true });
    mockClaves.completarClavesDeDominio.mockReturnValue([SOBRE_NUEVO]);

    await entrarConCuenta(DEPENDENCIAS, CREDENCIALES);

    expect(mockRepositorioClaves.subirSobresDeClave).toHaveBeenCalled();
  });

  it('si no falta ninguna clave no se llama al servidor', async () => {
    // Se ejecuta en cada arranque: una petición por arranque sin nada que
    // mandar sería gasto puro.
    mockClaves.completarClavesDeDominio.mockReturnValue([]);

    await reanudarSesion(DEPENDENCIAS);

    expect(mockRepositorioClaves.subirSobresDeClave).not.toHaveBeenCalled();
  });

  it('si la subida falla, la persona entra igual', async () => {
    // La sesión ya tiene la clave en memoria: el módulo funciona. Lo que queda
    // pendiente es que los otros dispositivos la reciban, y el arranque
    // siguiente lo reintenta. Cerrar el paso a la cuenta entera por esto sería
    // peor que el problema.
    mockClaves.completarClavesDeDominio.mockReturnValue([SOBRE_NUEVO]);
    mockRepositorioClaves.subirSobresDeClave.mockRejectedValue(new Error('sin red'));

    await expect(reanudarSesion(DEPENDENCIAS)).resolves.toMatchObject({ tipo: 'listo' });
  });

  it('sin poder desbloquear no se intenta completar nada', async () => {
    // Sin clave maestra en el dispositivo no hay con qué envolver: llamar aquí
    // fallaría, y además el camino correcto es restaurar con la frase.
    mockClaves.desbloquear.mockResolvedValue(false);

    await reanudarSesion(DEPENDENCIAS);

    expect(mockClaves.completarClavesDeDominio).not.toHaveBeenCalled();
  });
});
