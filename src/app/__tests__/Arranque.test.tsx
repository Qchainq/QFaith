// El arranque decide si se monta el flujo de acceso o el contenido. Se
// prueba aquí el camino de desbloqueo, que es el que separa a un usuario de
// su información privada.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as AutenticacionLocal from 'expo-local-authentication';

import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar } from '@shared/testing/renderizar';

import { Arranque } from '../Arranque';

const USUARIO = { id: 'abc', correo: 'ana@ejemplo.invalid' };

beforeEach(() => {
  useEstadoSesion.setState({
    fase: 'comprobando',
    usuario: null,
    fraseRecuperacionPendiente: null,
  });
});

describe('primer arranque', () => {
  it('lleva al onboarding cuando todavía no hay nada comprobado', async () => {
    renderizar(<Arranque />);

    await waitFor(() => expect(useEstadoSesion.getState().fase).toBe('onboarding'));
    expect(screen.getByText('Bienvenido a QFaith')).toBeTruthy();
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

describe('cambio entre alta e inicio de sesión', () => {
  it('alterna el modo del formulario', () => {
    useEstadoSesion.setState({ fase: 'sinSesion' });
    renderizar(<Arranque />);

    expect(screen.getByRole('header', { name: 'Crear cuenta' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Ya tengo cuenta' }));

    expect(screen.getByRole('header', { name: 'Iniciar sesión' })).toBeTruthy();
  });
});
