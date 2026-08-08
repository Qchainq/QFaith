// La analítica, conectada.
//
// El servicio y su vocabulario cerrado se prueban en `shared`. Esto comprueba
// lo otro, que es lo que se rompe en silencio: que el consentimiento del
// perfil llega hasta él, y que abrir una pantalla cuenta **la pantalla y
// nada más**.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { EventoAnalitica } from '@shared/services/analitica/eventos';
import type {
  ContextoAnalitica,
  PuertoAnalitica,
} from '@shared/services/analitica/puertoAnalitica';
import { renderizar } from '@shared/testing/renderizar';
import { Boton } from '@shared/components/Boton';
import { Texto } from '@shared/components/Texto';

import { ProveedorAnalitica, useAnalitica } from '../services/contextoAnalitica';
import { pantallaDeRuta } from '../use-cases/pantallaDeRuta';

const mockAjustes = jest.fn();
jest.mock('@modules/perfil/hooks/usePerfil', () => ({
  useAjustes: () => mockAjustes(),
}));

function puertoDePrueba() {
  const enviados: { evento: EventoAnalitica; contexto: ContextoAnalitica }[] = [];
  let olvidos = 0;
  const puerto: PuertoAnalitica = {
    enviar: async (evento, contexto) => {
      enviados.push({ evento, contexto });
    },
    olvidar: async () => {
      olvidos += 1;
    },
  };
  return { puerto, enviados, olvidos: () => olvidos };
}

/**
 * Registra un evento al pulsar, no al montar.
 *
 * Al montar sería un camino que no existe: el consentimiento se aplica en un
 * efecto, así que un evento disparado durante el primer render se descarta
 * siempre —y **debe** descartarse, porque en ese instante todavía no se sabe
 * si hay permiso—. Lo que ocurre de verdad es que la persona navega o hace
 * algo después, que es lo que esto imita.
 */
function Sonda() {
  const analitica = useAnalitica();
  return (
    <>
      <Texto nivel="texto">montado</Texto>
      <Boton
        etiqueta="registrar"
        onPress={() => void analitica?.registrar({ tipo: 'sesion.iniciada' })}
      />
    </>
  );
}

const registrarAlgo = async (): Promise<void> => {
  fireEvent.press(await screen.findByRole('button', { name: 'registrar' }));
};

describe('el consentimiento del perfil manda', () => {
  it('sin consentir no sale nada', async () => {
    mockAjustes.mockReturnValue({ data: { analitica: false } });
    const { puerto, enviados } = puertoDePrueba();

    renderizar(
      <ProveedorAnalitica puerto={puerto}>
        <Sonda />
      </ProveedorAnalitica>,
    );
    await registrarAlgo();

    expect(enviados).toHaveLength(0);
  });

  it('mientras los ajustes cargan tampoco', async () => {
    // Cualquier otra cosa sería enviar antes de saber si se puede.
    mockAjustes.mockReturnValue({ data: undefined });
    const { puerto, enviados } = puertoDePrueba();

    renderizar(
      <ProveedorAnalitica puerto={puerto}>
        <Sonda />
      </ProveedorAnalitica>,
    );
    await registrarAlgo();

    expect(enviados).toHaveLength(0);
  });

  it('con consentimiento, envía', async () => {
    mockAjustes.mockReturnValue({ data: { analitica: true } });
    const { puerto, enviados } = puertoDePrueba();

    renderizar(
      <ProveedorAnalitica puerto={puerto} consentida>
        <Sonda />
      </ProveedorAnalitica>,
    );
    await registrarAlgo();

    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));
  });
});

describe('lo que acompaña a cada evento', () => {
  it('no lleva identificador de cuenta', async () => {
    // «De forma agregada», dice el Documento 14. Una analítica con el
    // identificador de la persona dentro no lo es por mucho que se llame así.
    mockAjustes.mockReturnValue({ data: { analitica: true } });
    const { puerto, enviados } = puertoDePrueba();

    renderizar(
      <ProveedorAnalitica puerto={puerto} consentida>
        <Sonda />
      </ProveedorAnalitica>,
    );
    await registrarAlgo();
    await waitFor(() => expect(enviados.length).toBeGreaterThan(0));

    expect(Object.keys(enviados[0]?.contexto ?? {}).sort()).toEqual([
      'plataforma',
      'sesionId',
      'version',
      'versionSistema',
    ]);
  });
});

describe('fuera del proveedor', () => {
  it('no lanza: la analítica es lo único que puede faltar sin romper nada', async () => {
    // Una excepción por no poder contar una pantalla sería el peor cambio
    // posible, y este es el camino por el que llegaría.
    renderizar(<Sonda />);

    expect(await screen.findByText('montado')).toBeTruthy();
  });
});

describe('de rutas a pantallas', () => {
  it('las rutas conocidas se traducen', () => {
    expect(pantallaDeRuta('Diario')).toBe('diario');
    expect(pantallaDeRuta('IA')).toBe('ia');
    // Dos rutas distintas pueden ser la misma pantalla medible.
    expect(pantallaDeRuta('Portada')).toBe('inicio');
    expect(pantallaDeRuta('Inicio')).toBe('inicio');
  });

  it('una ruta que nadie ha decidido medir no se cuenta', () => {
    // El valor seguro: una pantalla nueva no empieza a medirse sola.
    expect(pantallaDeRuta('PantallaNueva')).toBeNull();
    expect(pantallaDeRuta(undefined)).toBeNull();
  });
});
