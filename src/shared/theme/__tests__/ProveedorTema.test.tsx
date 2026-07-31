// El tema decide los colores de toda la aplicación. Se comprueba que el modo
// oscuro no es una inversión del claro, sino una paleta propia (Documento 3).
import { render, screen } from '@testing-library/react-native';
import { Text, useColorScheme } from 'react-native';

import { renderizar } from '@shared/testing/renderizar';

import { ProveedorTema, useTema } from '../ProveedorTema';
import { coloresClaro, coloresOscuro } from '../tokens';

jest.mock('react-native/Libraries/Utilities/useColorScheme');

function Sonda() {
  const tema = useTema();
  return <Text>{`${tema.esOscuro ? 'oscuro' : 'claro'}|${tema.colores.fondo}`}</Text>;
}

/**
 * En ejecución, `useColorScheme` devuelve `null` cuando el sistema no expone
 * preferencia, pero su tipo público solo declara «claro» u «oscuro». Se
 * fuerza aquí para poder probar ese caso real, que es justo el que decide si
 * la aplicación arranca con una paleta o sin ninguna.
 */
function simularEsquema(esquema: 'light' | 'dark' | null): void {
  (useColorScheme as unknown as jest.Mock).mockReturnValue(esquema);
}

describe('resolución del esquema', () => {
  it('usa la paleta clara cuando el sistema está en claro', () => {
    simularEsquema('light');
    renderizar(<Sonda />);

    expect(screen.getByText(`claro|${coloresClaro.fondo}`)).toBeTruthy();
  });

  it('usa la paleta oscura cuando el sistema está en oscuro', () => {
    simularEsquema('dark');
    renderizar(<Sonda />);

    expect(screen.getByText(`oscuro|${coloresOscuro.fondo}`)).toBeTruthy();
  });

  it('sin preferencia del sistema cae en el modo claro', () => {
    simularEsquema(null);
    renderizar(<Sonda />);

    expect(screen.getByText(`claro|${coloresClaro.fondo}`)).toBeTruthy();
  });
});

describe('el modo oscuro se diseña aparte', () => {
  it('no es una simple inversión: el cristal y los acentos son propios', () => {
    expect(coloresOscuro.cristal).not.toBe(coloresClaro.cristal);
    expect(coloresOscuro.acento).not.toBe(coloresClaro.acento);
    expect(coloresOscuro.espiritual).not.toBe(coloresClaro.espiritual);
  });

  it('las tarjetas nunca son completamente opacas en ninguno de los dos modos', () => {
    [coloresClaro.cristal, coloresOscuro.cristal].forEach((cristal) => {
      expect(cristal).toMatch(/rgba\(.+,\s*0?\.\d+\)$/);
    });
  });
});

describe('uso fuera del proveedor', () => {
  it('avisa en lugar de devolver un tema a medias', () => {
    // Sin proveedor no hay tokens, y devolver valores por defecto escondería
    // el error hasta que apareciera un color equivocado en pantalla.
    expect(() => render(<Sonda />)).toThrow(/ProveedorTema/);
  });
});

describe('el proveedor entrega el resto de tokens', () => {
  it('expone espaciado, radios, tipografía, movimiento y cristal', () => {
    function SondaTokens() {
      const tema = useTema();
      return (
        <Text>
          {[
            tema.espaciado.md,
            tema.radios.lg,
            tema.tipografia.familias.texto,
            tema.movimiento.duracion.normal,
            tema.cristal.intensidadDesenfoque,
          ].join('/')}
        </Text>
      );
    }

    simularEsquema('light');
    render(
      <ProveedorTema>
        <SondaTokens />
      </ProveedorTema>,
    );

    expect(screen.getByText('16/20/Inter/260/24')).toBeTruthy();
  });
});
