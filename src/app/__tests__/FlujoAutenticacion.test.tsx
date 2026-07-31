// El enrutado del arranque decide qué ve el usuario antes de que haya nada
// descifrado. Un fallo aquí puede mostrar contenido privado sin desbloquear
// o dejar a alguien atrapado sin salida, así que se prueba fase por fase.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderizar } from '@shared/testing/renderizar';
import { useEstadoSesion } from '@shared/state/estadoSesion';

import { FlujoAutenticacion, type AccionesAutenticacion } from '../FlujoAutenticacion';

const FRASE = Array.from({ length: 24 }, (_, i) => `palabra${i + 1}`).join(' ');

function accionesDePrueba(): AccionesAutenticacion {
  return {
    modo: 'registro',
    cargando: false,
    alEnviarCredenciales: jest.fn(),
    alCambiarModo: jest.fn(),
    alRestaurar: jest.fn(async () => undefined),
    alDesbloquear: jest.fn(async () => true),
  };
}

function montar(acciones: AccionesAutenticacion = accionesDePrueba()) {
  renderizar(<FlujoAutenticacion acciones={acciones} />);
  return acciones;
}

beforeEach(() => {
  useEstadoSesion.setState({
    fase: 'comprobando',
    usuario: null,
    fraseRecuperacionPendiente: null,
  });
});

describe('cada fase muestra su pantalla', () => {
  it('mientras comprueba, informa de que está cargando', () => {
    montar();
    expect(screen.getByText('Cargando…')).toBeTruthy();
  });

  it('en onboarding empieza por la bienvenida', () => {
    useEstadoSesion.setState({ fase: 'onboarding' });
    montar();
    expect(screen.getByText('Bienvenido a QFaith')).toBeTruthy();
  });

  it('sin sesión muestra el formulario de acceso', () => {
    useEstadoSesion.setState({ fase: 'sinSesion' });
    montar();
    expect(screen.getAllByText('Crear cuenta').length).toBeGreaterThan(0);
  });

  it('mientras prepara la cuenta avisa sin dejar la pantalla muda', () => {
    useEstadoSesion.setState({ fase: 'preparandoCuenta' });
    montar();
    expect(screen.getByText('Preparando tu espacio privado…')).toBeTruthy();
  });

  it('bloqueada pide desbloquear y no muestra contenido', () => {
    useEstadoSesion.setState({ fase: 'bloqueada' });
    montar();
    expect(screen.getByText('QFaith está bloqueado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeTruthy();
  });

  it('lista no pinta nada del flujo de autenticación', () => {
    useEstadoSesion.setState({ fase: 'lista' });
    montar();
    expect(screen.queryByText('QFaith está bloqueado')).toBeNull();
    expect(screen.queryByText('Bienvenido a QFaith')).toBeNull();
  });
});

describe('frase de recuperación', () => {
  it('la muestra cuando está pendiente de confirmar', () => {
    useEstadoSesion.setState({ fase: 'mostrandoFrase', fraseRecuperacionPendiente: FRASE });
    montar();
    expect(screen.getByText('palabra1')).toBeTruthy();
  });

  it('sin frase en memoria vuelve al acceso en lugar de quedarse en blanco', () => {
    useEstadoSesion.setState({ fase: 'mostrandoFrase', fraseRecuperacionPendiente: null });
    montar();
    expect(screen.getAllByText('Crear cuenta').length).toBeGreaterThan(0);
  });

  it('al confirmarla, la frase deja de estar en memoria', () => {
    useEstadoSesion.setState({ fase: 'mostrandoFrase', fraseRecuperacionPendiente: FRASE });
    montar();

    useEstadoSesion.getState().confirmarFraseGuardada();

    expect(useEstadoSesion.getState().fraseRecuperacionPendiente).toBeNull();
    expect(useEstadoSesion.getState().fase).toBe('lista');
  });
});

describe('salidas sin callejones', () => {
  it('desde el acceso se puede ir a restaurar con la frase', () => {
    useEstadoSesion.setState({ fase: 'sinSesion' });
    montar({ ...accionesDePrueba(), modo: 'inicioSesion' });

    fireEvent.press(screen.getByRole('button', { name: 'Restaurar tu contenido' }));

    expect(useEstadoSesion.getState().fase).toBe('restaurando');
  });

  it('desde restaurar se puede volver atrás', () => {
    useEstadoSesion.setState({ fase: 'restaurando' });
    montar();

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(useEstadoSesion.getState().fase).toBe('sinSesion');
  });

  it('desde la pantalla de bloqueo se puede cerrar sesión', () => {
    useEstadoSesion.setState({ fase: 'bloqueada' });
    montar();

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(useEstadoSesion.getState().fase).toBe('sinSesion');
  });
});

describe('cierre de sesión', () => {
  it('olvida al usuario y cualquier frase pendiente', () => {
    useEstadoSesion.setState({
      fase: 'lista',
      usuario: { id: 'abc', correo: 'ana@ejemplo.invalid' },
      fraseRecuperacionPendiente: FRASE,
    });

    useEstadoSesion.getState().cerrarSesion();

    const estado = useEstadoSesion.getState();
    expect(estado.usuario).toBeNull();
    expect(estado.fraseRecuperacionPendiente).toBeNull();
    expect(estado.fase).toBe('sinSesion');
  });
});
