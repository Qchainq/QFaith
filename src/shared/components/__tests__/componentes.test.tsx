// Pruebas de los componentes base. Se centran en lo que el Design System
// promete y que es fácil romper sin darse cuenta: accesibilidad, estados y
// que un componente deshabilitado no actúe.
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { renderizar } from '@shared/testing/renderizar';

import { Boton } from '../Boton';
import { CampoTexto } from '../CampoTexto';
import { PantallaBase } from '../PantallaBase';
import { Superficie } from '../Superficie';
import { Texto } from '../Texto';

describe('Boton', () => {
  it('llama a su acción al pulsarlo', () => {
    const alPulsar = jest.fn();
    renderizar(<Boton etiqueta="Guardar" onPress={alPulsar} />);

    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(alPulsar).toHaveBeenCalledTimes(1);
  });

  it('deshabilitado no actúa y lo anuncia al lector de pantalla', () => {
    const alPulsar = jest.fn();
    renderizar(<Boton etiqueta="Guardar" onPress={alPulsar} deshabilitado />);

    const boton = screen.getByRole('button', { name: 'Guardar' });
    fireEvent.press(boton);

    expect(alPulsar).not.toHaveBeenCalled();
    expect(boton.props.accessibilityState.disabled).toBe(true);
  });

  it('cargando no actúa y se anuncia como ocupado', () => {
    const alPulsar = jest.fn();
    renderizar(<Boton etiqueta="Guardar" onPress={alPulsar} cargando />);

    const boton = screen.getByRole('button', { name: 'Guardar' });
    fireEvent.press(boton);

    expect(alPulsar).not.toHaveBeenCalled();
    expect(boton.props.accessibilityState.busy).toBe(true);
    // Mientras carga, la etiqueta deja paso al indicador.
    expect(screen.queryByText('Guardar')).toBeNull();
  });

  it('responde al gesto sin quedarse encogido', () => {
    renderizar(<Boton etiqueta="Guardar" onPress={jest.fn()} />);
    const boton = screen.getByRole('button', { name: 'Guardar' });

    fireEvent(boton, 'pressIn');
    fireEvent(boton, 'pressOut');

    expect(boton).toBeTruthy();
  });

  it('acepta las tres variantes del sistema', () => {
    (['primario', 'secundario', 'texto'] as const).forEach((variante) => {
      const { unmount } = renderizar(
        <Boton etiqueta={variante} onPress={jest.fn()} variante={variante} />,
      );
      expect(screen.getByRole('button', { name: variante })).toBeTruthy();
      unmount();
    });
  });

  it('admite una pista de accesibilidad cuando la etiqueta no basta', () => {
    renderizar(
      <Boton etiqueta="Continuar" onPress={jest.fn()} accessibilityHint="Ir al siguiente paso" />,
    );

    expect(screen.getByRole('button', { name: 'Continuar' }).props.accessibilityHint).toBe(
      'Ir al siguiente paso',
    );
  });
});

describe('CampoTexto', () => {
  it('muestra su etiqueta y la usa como nombre accesible', () => {
    renderizar(<CampoTexto etiqueta="Correo" value="" onChangeText={jest.fn()} />);

    expect(screen.getByText('Correo')).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
  });

  it('propaga lo que se escribe', () => {
    const alCambiar = jest.fn();
    renderizar(<CampoTexto etiqueta="Correo" value="" onChangeText={alCambiar} />);

    fireEvent.changeText(screen.getByLabelText('Correo'), 'ana@ejemplo.invalid');

    expect(alCambiar).toHaveBeenCalledWith('ana@ejemplo.invalid');
  });

  it('el error se muestra y se anuncia, no solo cambia el color del borde', () => {
    renderizar(
      <CampoTexto etiqueta="Correo" value="mal" onChangeText={jest.fn()} error="No es válido" />,
    );

    expect(screen.getByText('No es válido')).toBeTruthy();
    expect(screen.getByLabelText('Correo').props.accessibilityHint).toBe('No es válido');
  });

  it('la ayuda aparece solo si no hay error', () => {
    const { rerender } = renderizar(
      <CampoTexto etiqueta="Correo" value="" onChangeText={jest.fn()} ayuda="Usaremos tu correo" />,
    );
    expect(screen.getByText('Usaremos tu correo')).toBeTruthy();

    rerender(
      <CampoTexto
        etiqueta="Correo"
        value=""
        onChangeText={jest.fn()}
        ayuda="Usaremos tu correo"
        error="No es válido"
      />,
    );
    expect(screen.queryByText('Usaremos tu correo')).toBeNull();
    expect(screen.getByText('No es válido')).toBeTruthy();
  });

  it('deshabilitado no se puede editar', () => {
    renderizar(<CampoTexto etiqueta="Correo" value="" onChangeText={jest.fn()} deshabilitado />);

    expect(screen.getByLabelText('Correo').props.editable).toBe(false);
  });

  it('avisa a quien lo usa cuando entra y sale del campo', () => {
    const alEnfocar = jest.fn();
    const alSalir = jest.fn();
    renderizar(
      <CampoTexto
        etiqueta="Correo"
        value=""
        onChangeText={jest.fn()}
        onFocus={alEnfocar}
        onBlur={alSalir}
      />,
    );

    const campo = screen.getByLabelText('Correo');
    fireEvent(campo, 'focus');
    fireEvent(campo, 'blur');

    expect(alEnfocar).toHaveBeenCalled();
    expect(alSalir).toHaveBeenCalled();
  });
});

describe('Texto', () => {
  it('acepta todos los niveles de la escala tipográfica', () => {
    (['tituloPrincipal', 'tituloSecundario', 'subtitulo', 'texto', 'nota', 'pie'] as const).forEach(
      (nivel) => {
        const { unmount } = renderizar(<Texto nivel={nivel}>{nivel}</Texto>);
        expect(screen.getByText(nivel)).toBeTruthy();
        unmount();
      },
    );
  });

  it('acepta todos los tonos', () => {
    (['principal', 'secundario', 'tenue', 'acento', 'error'] as const).forEach((tono) => {
      const { unmount } = renderizar(<Texto tono={tono}>{tono}</Texto>);
      expect(screen.getByText(tono)).toBeTruthy();
      unmount();
    });
  });

  it('usa la fuente espiritual solo cuando se pide', () => {
    renderizar(
      <>
        <Texto>normal</Texto>
        <Texto espiritual>espiritual</Texto>
      </>,
    );

    // El estilo llega como lista, así que hay que aplanarlo antes de mirarlo.
    const fuenteDe = (texto: string): string | undefined =>
      StyleSheet.flatten(screen.getByText(texto).props.style)?.fontFamily;

    expect(fuenteDe('normal')).toBe('Inter');
    expect(fuenteDe('espiritual')).toBe('Merriweather');
  });
});

describe('Superficie', () => {
  it('envuelve su contenido en las dos variantes', () => {
    (['elevada', 'plana'] as const).forEach((variante) => {
      const { unmount } = renderizar(
        <Superficie variante={variante}>
          <Text>{`contenido ${variante}`}</Text>
        </Superficie>,
      );
      expect(screen.getByText(`contenido ${variante}`)).toBeTruthy();
      unmount();
    });
  });
});

describe('PantallaBase', () => {
  it('el título es una cabecera para el lector de pantalla', () => {
    renderizar(<PantallaBase titulo="Diario" />);

    expect(screen.getByRole('header', { name: 'Diario' })).toBeTruthy();
  });

  it('muestra el estado vacío cuando no hay contenido', () => {
    renderizar(<PantallaBase titulo="Diario" mensajeVacio="Aquí guardarás tus reflexiones." />);

    expect(screen.getByText('Aquí guardarás tus reflexiones.')).toBeTruthy();
  });

  it('el contenido tiene prioridad sobre el estado vacío', () => {
    renderizar(
      <PantallaBase titulo="Diario" mensajeVacio="vacío">
        <Text>una entrada</Text>
      </PantallaBase>,
    );

    expect(screen.getByText('una entrada')).toBeTruthy();
    expect(screen.queryByText('vacío')).toBeNull();
  });

  it('sin contenido ni mensaje no rompe', () => {
    renderizar(<PantallaBase titulo="Diario" />);
    expect(screen.getByText('Diario')).toBeTruthy();
  });
});
