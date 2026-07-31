// Pruebas de las pantallas del flujo de acceso. Comprueban lo que decide si
// el usuario puede entrar, salir o quedarse atascado.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ErrorApp } from '@shared/errores/erroresApp';
import { renderizar } from '@shared/testing/renderizar';

import { PantallaAcceso } from '../PantallaAcceso';
import { PantallaDesbloqueo } from '../PantallaDesbloqueo';
import { PantallaOnboarding } from '../PantallaOnboarding';
import { PantallaRestaurar } from '../PantallaRestaurar';

const FRASE = Array.from({ length: 24 }, (_, i) => `palabra${i + 1}`).join(' ');

describe('PantallaOnboarding', () => {
  it('recorre los seis pasos en el orden del Documento 10', () => {
    const alTerminar = jest.fn();
    renderizar(<PantallaOnboarding alTerminar={alTerminar} />);

    const titulos = [
      'Bienvenido a QFaith',
      'Lo tuyo es tuyo',
      'Constancia sin presión',
      'Un acompañante, no una autoridad',
      'Tu iglesia, si tú quieres',
      'Empecemos',
    ];

    titulos.forEach((titulo, indice) => {
      expect(screen.getByText(titulo)).toBeTruthy();
      if (indice < titulos.length - 1) {
        fireEvent.press(screen.getByRole('button', { name: 'Siguiente' }));
      }
    });

    // En el último paso el botón cambia y ya no se ofrece saltar.
    expect(screen.queryByRole('button', { name: 'Saltar' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(alTerminar).toHaveBeenCalledTimes(1);
  });

  it('se puede saltar desde el principio', () => {
    const alTerminar = jest.fn();
    renderizar(<PantallaOnboarding alTerminar={alTerminar} />);

    fireEvent.press(screen.getByRole('button', { name: 'Saltar' }));

    expect(alTerminar).toHaveBeenCalledTimes(1);
  });

  it('informa del progreso sin convertirlo en una recompensa', () => {
    renderizar(<PantallaOnboarding alTerminar={jest.fn()} />);

    const barra = screen.getByRole('progressbar');
    expect(barra.props.accessibilityValue).toEqual({ min: 1, max: 6, now: 1 });
  });
});

describe('PantallaAcceso', () => {
  function montar(props: Partial<Parameters<typeof PantallaAcceso>[0]> = {}) {
    const alEnviar = jest.fn();
    const alCambiarModo = jest.fn();
    renderizar(
      <PantallaAcceso
        modo="registro"
        alEnviar={alEnviar}
        alCambiarModo={alCambiarModo}
        {...props}
      />,
    );
    return { alEnviar, alCambiarModo };
  }

  it('no deja enviar hasta que los datos son válidos', () => {
    const { alEnviar } = montar();

    const boton = screen.getByRole('button', { name: 'Crear cuenta' });
    expect(boton.props.accessibilityState.disabled).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@ejemplo.invalid');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'unaClaveLarga');

    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(alEnviar).toHaveBeenCalledWith({
      correo: 'ana@ejemplo.invalid',
      contrasena: 'unaClaveLarga',
    });
  });

  it('avisa del correo mal escrito al salir del campo', () => {
    montar();

    const campo = screen.getByLabelText('Correo electrónico');
    fireEvent.changeText(campo, 'no-es-un-correo');
    fireEvent(campo, 'blur');

    expect(screen.getByText('Escribe un correo válido.')).toBeTruthy();
  });

  it('en el alta avisa si la contraseña es corta', () => {
    montar();

    const campo = screen.getByLabelText('Contraseña');
    fireEvent.changeText(campo, 'corta');
    fireEvent(campo, 'blur');

    expect(screen.getByText('La contraseña necesita al menos 8 caracteres.')).toBeTruthy();
  });

  it('al iniciar sesión no exige longitud mínima, porque la contraseña ya existe', () => {
    const { alEnviar } = montar({ modo: 'inicioSesion' });

    fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@ejemplo.invalid');
    const campo = screen.getByLabelText('Contraseña');
    fireEvent.changeText(campo, 'antigua');
    fireEvent(campo, 'blur');

    expect(screen.queryByText('La contraseña necesita al menos 8 caracteres.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(alEnviar).toHaveBeenCalled();
  });

  it('muestra el error del servidor ya traducido y sin detalle técnico', () => {
    montar({ errorGeneral: 'errores.autenticacion' });

    expect(screen.getByText('Tu sesión ha caducado. Vuelve a iniciar sesión.')).toBeTruthy();
  });

  it('permite cambiar entre alta e inicio de sesión', () => {
    const { alCambiarModo } = montar();

    fireEvent.press(screen.getByRole('button', { name: 'Ya tengo cuenta' }));

    expect(alCambiarModo).toHaveBeenCalledTimes(1);
  });

  it('mientras carga no se puede reenviar', () => {
    const { alEnviar } = montar({ cargando: true });

    fireEvent.changeText(screen.getByLabelText('Correo electrónico'), 'ana@ejemplo.invalid');
    fireEvent.changeText(screen.getByLabelText('Contraseña'), 'unaClaveLarga');
    fireEvent.press(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(alEnviar).not.toHaveBeenCalled();
  });
});

describe('PantallaDesbloqueo', () => {
  it('desbloquea cuando el usuario se identifica', async () => {
    const alDesbloquear = jest.fn(async () => true);
    renderizar(<PantallaDesbloqueo alDesbloquear={alDesbloquear} alCerrarSesion={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));

    await waitFor(() => expect(alDesbloquear).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Algo no ha salido bien. Inténtalo de nuevo.')).toBeNull();
  });

  it('si falla lo dice sin reproche y deja volver a intentarlo', async () => {
    const alDesbloquear = jest.fn(async () => false);
    renderizar(<PantallaDesbloqueo alDesbloquear={alDesbloquear} alCerrarSesion={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Desbloquear' }));

    await waitFor(() =>
      expect(screen.getByText('Algo no ha salido bien. Inténtalo de nuevo.')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Desbloquear' })).toBeTruthy();
  });

  it('ofrece salir en lugar de dejar al usuario encerrado', () => {
    const alCerrarSesion = jest.fn();
    renderizar(
      <PantallaDesbloqueo
        alDesbloquear={jest.fn(async () => true)}
        alCerrarSesion={alCerrarSesion}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(alCerrarSesion).toHaveBeenCalledTimes(1);
  });
});

describe('PantallaRestaurar', () => {
  function montar(alRestaurar = jest.fn(async () => undefined)) {
    const alCancelar = jest.fn();
    renderizar(<PantallaRestaurar alRestaurar={alRestaurar} alCancelar={alCancelar} />);
    return { alRestaurar, alCancelar };
  }

  it('no deja restaurar con una frase que no tiene 24 palabras', () => {
    const { alRestaurar } = montar();

    const campo = screen.getByLabelText('Frase de recuperación');
    fireEvent.changeText(campo, 'tres palabras sueltas');
    fireEvent(campo, 'blur');

    expect(
      screen.getByText('Esa frase de recuperación no es válida. Revisa las palabras.'),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Restaurar' }));
    expect(alRestaurar).not.toHaveBeenCalled();
  });

  it('normaliza la frase antes de entregarla', async () => {
    const { alRestaurar } = montar();

    fireEvent.changeText(
      screen.getByLabelText('Frase de recuperación'),
      `  ${FRASE.toUpperCase()}  `,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Restaurar' }));

    await waitFor(() => expect(alRestaurar).toHaveBeenCalledWith(FRASE));
  });

  it('si la frase no corresponde, muestra el mensaje del error clasificado', async () => {
    const alRestaurar = jest.fn(async () => {
      throw new ErrorApp({
        codigo: 'RECUPERACION_FALLIDA',
        categoria: 'cifrado',
        claveMensaje: 'errores.cifrado.recuperacionFallida',
        puedeReintentarse: false,
      });
    });
    montar(alRestaurar);

    fireEvent.changeText(screen.getByLabelText('Frase de recuperación'), FRASE);
    fireEvent.press(screen.getByRole('button', { name: 'Restaurar' }));

    await waitFor(() =>
      expect(screen.getByText('La frase no corresponde a esta cuenta.')).toBeTruthy(),
    );
  });

  it('ante un fallo inesperado muestra el mensaje genérico, nunca el detalle técnico', async () => {
    const alRestaurar = jest.fn(async () => {
      throw new Error('column "foo" does not exist');
    });
    montar(alRestaurar);

    fireEvent.changeText(screen.getByLabelText('Frase de recuperación'), FRASE);
    fireEvent.press(screen.getByRole('button', { name: 'Restaurar' }));

    await waitFor(() =>
      expect(screen.getByText('Algo no ha salido bien. Inténtalo de nuevo.')).toBeTruthy(),
    );
    expect(screen.queryByText(/column/)).toBeNull();
  });

  it('se puede cancelar y volver atrás', () => {
    const { alCancelar } = montar();

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(alCancelar).toHaveBeenCalledTimes(1);
  });
});
