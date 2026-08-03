// Lo que se vigila aquí, además de que el flujo funcione, es que ningún
// mensaje del proveedor llegue a un log con el correo dentro (invariante 2) y
// que un alta sin sesión no se dé por buena: sin token no hay forma de subir
// los sobres de claves, y el usuario acabaría con una cuenta a medias.
import { esErrorApp } from '@shared/errores/erroresApp';

import {
  cerrarSesion,
  iniciarSesion,
  registrar,
  sesionActual,
  tokenAcceso,
} from '../servicioAutenticacion';

const mockAuth = {
  signUp: jest.fn(),
  signInWithPassword: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
};

jest.mock('../../supabase/clienteSupabase', () => ({
  clienteSupabase: () => ({ auth: mockAuth }),
}));

const CREDENCIALES = { correo: 'persona@ejemplo.test', contrasena: 'una-contrasena-larga' };
const USUARIO = { id: '11111111-1111-4111-8111-111111111111', email: 'persona@ejemplo.test' };

describe('alta', () => {
  it('devuelve el usuario y avisa de si hubo sesión', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: USUARIO, session: { access_token: 't' } },
      error: null,
    });

    await expect(registrar(CREDENCIALES)).resolves.toEqual({
      usuario: { id: USUARIO.id, correo: USUARIO.email },
      conSesion: true,
    });
  });

  it('marca el alta sin sesión cuando el proyecto exige confirmar el correo', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: USUARIO, session: null }, error: null });

    const resultado = await registrar(CREDENCIALES);

    // Quien llama debe detenerse aquí: sin token no puede subir los sobres.
    expect(resultado.conSesion).toBe(false);
  });

  it('traduce el correo ya registrado a un mensaje propio', async () => {
    mockAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'user_already_exists' },
    });

    await expect(registrar(CREDENCIALES)).rejects.toMatchObject({
      codigo: 'CORREO_YA_REGISTRADO',
      claveMensaje: 'errores.cuenta.correoYaRegistrado',
    });
  });

  it.each([
    ['weak_password', 'CONTRASENA_DEBIL', 'errores.cuenta.contrasenaDebil'],
    ['email_not_confirmed', 'CORREO_SIN_CONFIRMAR', 'errores.cuenta.correoSinConfirmar'],
  ])('traduce «%s» a un mensaje que dice qué hacer', async (codigo, esperado, clave) => {
    // Sin traducir, la pantalla enseñaría el texto en inglés del proveedor y
    // la persona no sabría si el problema es suyo o del servicio.
    mockAuth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: codigo },
    });

    await expect(registrar(CREDENCIALES)).rejects.toMatchObject({
      codigo: esperado,
      claveMensaje: clave,
    });
  });

  it('un error sin código no se queda sin traducir', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: {} });

    await expect(registrar(CREDENCIALES)).rejects.toMatchObject({
      codigo: 'AUTENTICACION_FALLIDA',
      claveMensaje: 'errores.autenticacion',
    });
  });

  it('un alta que no devuelve usuario falla en vez de seguir sin identidad', async () => {
    // Sin `user.id` no hay a quién asociar las claves: continuar dejaría
    // sobres cifrados sin dueño.
    mockAuth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: null });

    await expect(registrar(CREDENCIALES)).rejects.toMatchObject({
      codigo: 'ALTA_SIN_USUARIO',
    });
  });
});

describe('inicio de sesión', () => {
  it('devuelve el usuario cuando las credenciales son válidas', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: USUARIO, session: { access_token: 'token' } },
      error: null,
    });

    await expect(iniciarSesion(CREDENCIALES)).resolves.toMatchObject({ conSesion: true });
  });

  it('traduce las credenciales inválidas sin decir cuál de las dos falla', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials' },
    });

    await expect(iniciarSesion(CREDENCIALES)).rejects.toMatchObject({
      codigo: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('marca el exceso de intentos como reintentable', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'over_request_rate_limit' },
    });

    await expect(iniciarSesion(CREDENCIALES)).rejects.toMatchObject({
      codigo: 'DEMASIADOS_INTENTOS',
      puedeReintentarse: true,
    });
  });

  it('no acepta una respuesta sin sesión', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: USUARIO, session: null },
      error: null,
    });

    await expect(iniciarSesion(CREDENCIALES)).rejects.toMatchObject({
      codigo: 'SESION_NO_EMITIDA',
    });
  });
});

describe('lo que acaba en los registros', () => {
  it('nunca lleva el correo ni la contraseña', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'invalid_credentials', message: `Invalid login for ${CREDENCIALES.correo}` },
    });

    await iniciarSesion(CREDENCIALES).catch((error: unknown) => {
      expect(esErrorApp(error)).toBe(true);
      if (!esErrorApp(error)) return;
      const registro = JSON.stringify(error.aRegistroSeguro());
      expect(registro).not.toContain('persona@ejemplo.test');
      expect(registro).not.toContain(CREDENCIALES.contrasena);
      expect(error.message).not.toContain('persona@ejemplo.test');
    });
    expect.hasAssertions();
  });
});

describe('sesión guardada', () => {
  it('devuelve null cuando no hay ninguna', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });

    await expect(sesionActual()).resolves.toBeNull();
    await expect(tokenAcceso()).resolves.toBeNull();
  });

  it('devuelve el usuario y el token vigente', async () => {
    mockAuth.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-vigente', user: USUARIO } },
    });

    await expect(sesionActual()).resolves.toEqual({ id: USUARIO.id, correo: USUARIO.email });
    await expect(tokenAcceso()).resolves.toBe('token-vigente');
  });

  it('cerrar sesión propaga el fallo del proveedor traducido', async () => {
    mockAuth.signOut.mockResolvedValue({ error: { code: 'over_request_rate_limit' } });

    await expect(cerrarSesion()).rejects.toMatchObject({ codigo: 'DEMASIADOS_INTENTOS' });
  });

  it('cerrar sesión no falla cuando todo va bien', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });

    await expect(cerrarSesion()).resolves.toBeUndefined();
  });
});
