// El arranque decide si se monta el flujo de acceso o el contenido. Lo que se
// prueba aquí es la traducción de cada paso del caso de uso a una fase, que es
// lo que separa a un usuario de su información privada.
//
// El caso de uso se sustituye por un doble: su lógica tiene sus propias
// pruebas, y aquí interesa el enrutado, no la red.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as AutenticacionLocal from 'expo-local-authentication';

import { ErrorApp } from '@shared/errores/erroresApp';
import { generarFraseRecuperacion } from '@shared/services/crypto/servicioCriptografia';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar } from '@shared/testing/renderizar';

import { Arranque } from '../Arranque';

const mockAcceso = {
  crearCuenta: jest.fn(),
  entrarConCuenta: jest.fn(),
  reanudarSesion: jest.fn(),
  restaurarCuenta: jest.fn(),
};

jest.mock('@modules/autenticacion/use-cases/accesoACuenta', () => ({
  crearCuenta: (...args: never[]) => mockAcceso.crearCuenta(...args),
  entrarConCuenta: (...args: never[]) => mockAcceso.entrarConCuenta(...args),
  reanudarSesion: (...args: never[]) => mockAcceso.reanudarSesion(...args),
  restaurarCuenta: (...args: never[]) => mockAcceso.restaurarCuenta(...args),
}));

const USUARIO = { id: 'abc', correo: 'ana@ejemplo.invalid' };
const CREDENCIALES = { correo: 'ana@ejemplo.invalid', contrasena: 'contrasena-larga' };

beforeEach(() => {
  useEstadoSesion.setState({
    fase: 'comprobando',
    usuario: null,
    fraseRecuperacionPendiente: null,
  });
  mockAcceso.reanudarSesion.mockResolvedValue({ tipo: 'sinSesion' });
});

function rellenarYEnviar(): void {
  fireEvent.changeText(screen.getByLabelText('Correo electrónico'), CREDENCIALES.correo);
  fireEvent.changeText(screen.getByLabelText('Contraseña'), CREDENCIALES.contrasena);
  fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('primer arranque', () => {
  it('lleva al onboarding cuando no hay sesión guardada', async () => {
    renderizar(<Arranque />);

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('onboarding'));
    expect(screen.getByText('Bienvenido a QFaith')).toBeTruthy();
  });

  it('con sesión y claves en el dispositivo entra directo', async () => {
    mockAcceso.reanudarSesion.mockResolvedValue({ tipo: 'listo', usuario: USUARIO });
    renderizar(<Arranque />);

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('lista'));
    expect(useEstadoSesion.getState().usuario).toEqual(USUARIO);
  });

  it('con sesión pero sin claves pide la frase', async () => {
    mockAcceso.reanudarSesion.mockResolvedValue({ tipo: 'restaurarConFrase', usuario: USUARIO });
    renderizar(<Arranque />);

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('restaurando'));
  });

  it('si la comprobación falla, no deja al usuario en una pantalla de carga', async () => {
    // Sin red, por ejemplo. Se entra por el camino normal (invariante 4).
    mockAcceso.reanudarSesion.mockRejectedValue(new Error('sin red'));
    renderizar(<Arranque />);

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('onboarding'));
  });

  it('la comprobación se hace una sola vez', async () => {
    renderizar(<Arranque />);

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('onboarding'));
    expect(mockAcceso.reanudarSesion).toHaveBeenCalledTimes(1);
  });
});

describe('alta de cuenta', () => {
  it('muestra la frase de recuperación al terminar', async () => {
    mockAcceso.crearCuenta.mockResolvedValue({
      tipo: 'mostrarFrase',
      usuario: USUARIO,
      frase: 'una frase de veinticuatro palabras',
    });
    useEstadoSesion.setState({ fase: 'sinSesion' });
    renderizar(<Arranque />);

    rellenarYEnviar();

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('mostrandoFrase'));
    expect(useEstadoSesion.getState().fraseRecuperacionPendiente).toBe(
      'una frase de veinticuatro palabras',
    );
  });

  it('avisa cuando falta confirmar el correo y vuelve al acceso', async () => {
    mockAcceso.crearCuenta.mockResolvedValue({ tipo: 'confirmarCorreo' });
    useEstadoSesion.setState({ fase: 'sinSesion' });
    renderizar(<Arranque />);

    rellenarYEnviar();

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('sinSesion'));
    expect(screen.getByText(/Confirma tu correo/)).toBeTruthy();
  });

  it('muestra el mensaje del error, nunca el del proveedor', async () => {
    mockAcceso.crearCuenta.mockRejectedValue(
      new ErrorApp({
        codigo: 'CORREO_YA_REGISTRADO',
        categoria: 'autenticacion',
        claveMensaje: 'errores.cuenta.correoYaRegistrado',
        puedeReintentarse: false,
      }),
    );
    useEstadoSesion.setState({ fase: 'sinSesion' });
    renderizar(<Arranque />);

    rellenarYEnviar();

    await waitFor(() => expect(screen.getByText(/Ya existe una cuenta/)).toBeTruthy());
  });

  it('un fallo desconocido no filtra su mensaje técnico', async () => {
    mockAcceso.crearCuenta.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.4:5432'));
    useEstadoSesion.setState({ fase: 'sinSesion' });
    renderizar(<Arranque />);

    rellenarYEnviar();

    await waitFor(() =>
      expect(screen.getByText('Algo no ha salido bien. Inténtalo de nuevo.')).toBeTruthy(),
    );
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });
});

describe('desbloqueo', () => {
  it('abre la sesión cuando el usuario se identifica', async () => {
    useEstadoSesion.setState({ fase: 'bloqueada', usuario: USUARIO });
    renderizar(<Arranque />);

    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('lista'));
    expect(AutenticacionLocal.authenticateAsync).toHaveBeenCalled();
  });

  it('si el usuario no se identifica, la sesión sigue bloqueada', async () => {
    jest
      .mocked(AutenticacionLocal.authenticateAsync)
      .mockResolvedValueOnce({ success: false, error: 'user_cancel' });
    useEstadoSesion.setState({ fase: 'bloqueada', usuario: USUARIO });
    renderizar(<Arranque />);

    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));

    await waitFor(() =>
      expect(screen.getByText('Algo no ha salido bien. Inténtalo de nuevo.')).toBeTruthy(),
    );
    expect(useEstadoSesion.getState().fase).toBe('bloqueada');
  });

  it('sin usuario en el estado no se abre sesión aunque la biometría acepte', async () => {
    // Estado inconsistente: se identifica a alguien, pero no sabemos a quién.
    // Abrir sesión aquí mostraría contenido sin saber de quién es.
    useEstadoSesion.setState({ fase: 'bloqueada', usuario: null });
    renderizar(<Arranque />);

    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));

    await waitFor(() => expect(AutenticacionLocal.authenticateAsync).toHaveBeenCalled());
    expect(useEstadoSesion.getState().fase).toBe('bloqueada');
  });
});

describe('restauración', () => {
  it('deja la sesión lista cuando la frase es correcta', async () => {
    mockAcceso.restaurarCuenta.mockResolvedValue({ tipo: 'listo', usuario: USUARIO });
    useEstadoSesion.setState({ fase: 'restaurando', usuario: USUARIO });
    renderizar(<Arranque />);

    // La pantalla valida las 24 palabras antes de llamar al caso de uso.
    fireEvent.changeText(
      screen.getByLabelText('Frase de recuperación'),
      generarFraseRecuperacion(),
    );
    fireEvent.press(screen.getByRole('button', { name: 'Restaurar' }));

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('lista'));
  });
});

describe('cambio entre alta e inicio de sesión', () => {
  it('alterna el modo del formulario', () => {
    useEstadoSesion.setState({ fase: 'sinSesion' });
    renderizar(<Arranque />);

    expect(screen.getByRole('header', { name: 'Crear cuenta' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Ya tengo cuenta' }));

    expect(screen.getByRole('header', { name: 'Iniciar sesión' })).toBeTruthy();
  });
});
