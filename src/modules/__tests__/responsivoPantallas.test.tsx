// Las pantallas en tamaños que no son un teléfono, barridas de una vez.
//
// La función que decide la adaptación se prueba sola en `dimensiones.test.ts`.
// Esto comprueba lo otro, que es distinto y no menos importante: que las
// pantallas de verdad la usan. Una regla responsiva impecable que solo
// aplique `PantallaBase` no sirve de nada si una pantalla se pinta por su
// cuenta, y ese es el fallo que se cuela sin que nadie lo vea hasta que
// alguien abre la aplicación en una tableta.
//
// Lo que no se puede medir aquí —cómo queda de verdad en un iPad, si el
// teclado tapa el campo, si un plegable reordena al abrirse— hay que probarlo
// en un dispositivo. El Documento 14 lo pide y sigue pendiente. Esto cubre lo
// que sí se puede saber antes.
import { screen } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import { BibliaContenedor } from '@modules/biblia/screens/BibliaContenedor';
import { BibliotecaContenedor } from '@modules/biblioteca-vida/screens/BibliotecaContenedor';
import { DiarioContenedor } from '@modules/diario/screens/DiarioContenedor';
import { ExportarContenedor } from '@modules/exportacion/screens/ExportarContenedor';
import { HabitosContenedor } from '@modules/habitos/screens/HabitosContenedor';
import { IaContenedor } from '@modules/ia/screens/IaContenedor';
import { IglesiaContenedor } from '@modules/iglesia/screens/IglesiaContenedor';
import { PantallaInicio } from '@modules/inicio/screens/PantallaInicio';
import { MemorialContenedor } from '@modules/memorial/screens/MemorialContenedor';
import { OracionContenedor } from '@modules/oracion/screens/OracionContenedor';
import { PerfilContenedor } from '@modules/perfil/screens/PerfilContenedor';
import { PlanesContenedor } from '@modules/planes/screens/PlanesContenedor';
import { PulsoContenedor } from '@modules/pulso/screens/PulsoContenedor';
import { SermonesContenedor } from '@modules/sermones/screens/SermonesContenedor';
import { crearSincronizacionDePrueba } from '@modules/sincronizacion/__tests__/sincronizacionDePrueba';
import { ProveedorSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { SuscripcionContenedor } from '@modules/suscripcion/screens/SuscripcionContenedor';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { estiloPlano } from '@shared/testing/accesibilidad';
import { renderizar } from '@shared/testing/renderizar';
import { ANCHO_MAXIMO_LECTURA, medidaDe } from '@shared/theme/dimensiones';

jest.mock('@shared/services/supabase/rest', () => ({
  crearClienteRest: () => ({
    peticion: async () => ({ estado: 200, filas: [], codigo: null }),
    comoError: () => new Error('sin red'),
  }),
}));

// `useWindowDimensions` lee de la ventana real, que en las pruebas es siempre
// la misma. Sustituirlo es la única forma de montar una pantalla como si
// estuviera en una tableta.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions');
const mockDimensiones = jest.mocked(useWindowDimensions);

const PANTALLAS = [
  ['Inicio', PantallaInicio],
  ['Diario', DiarioContenedor],
  ['Oración', OracionContenedor],
  ['Hábitos', HabitosContenedor],
  ['Biblia', BibliaContenedor],
  ['Biblioteca de vida', BibliotecaContenedor],
  ['Memorial', MemorialContenedor],
  ['Acompañante', IaContenedor],
  ['Iglesia', IglesiaContenedor],
  ['Sermones', SermonesContenedor],
  ['Pulso', PulsoContenedor],
  ['Planes', PlanesContenedor],
  ['Perfil', PerfilContenedor],
  ['Exportar', ExportarContenedor],
  ['Suscripción', SuscripcionContenedor],
] as const;

/** Los tres casos que el Documento 14 nombra y que aquí se pueden montar. */
const TAMANOS = [
  ['iPhone SE', 320, 568],
  ['iPad tumbado', 1194, 834],
  ['teléfono tumbado', 844, 390],
] as const;

beforeEach(() => {
  useEstadoSesion
    .getState()
    .abrirSesion({ id: 'usuario-1', correo: 'ana@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(() => {
  useEstadoSesion.getState().cerrarSesion();
});

function montar(Componente: (typeof PANTALLAS)[number][1], ancho: number, alto: number) {
  mockDimensiones.mockReturnValue({ width: ancho, height: alto, scale: 2, fontScale: 1 });

  const almacen = crearAlmacenEnMemoria();
  const sincronizacion = crearSincronizacionDePrueba({
    almacen,
    usuarioId: 'usuario-1',
    remoto: crearServidorEnMemoria(),
  });

  return renderizar(
    <ProveedorSincronizacion
      usuarioId="usuario-1"
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
      sincronizarEnSegundoPlano={false}
    >
      <Componente />
    </ProveedorSincronizacion>,
  );
}

/**
 * Cuántas columnas de contenido encuentra el barrido.
 *
 * Mismo motivo que en el barrido de accesibilidad: todo lo de abajo comprueba
 * que algo **no** pasa, y eso pasa igual cuando está bien que cuando el
 * detector ha dejado de ver nada. Si `PantallaBase` cambiara de forma y el
 * barrido midiera un árbol sin columnas, las pruebas seguirían en verde sin
 * mirar. Esta no.
 */
let columnas = 0;

afterAll(() => {
  expect(columnas).toBeGreaterThan(PANTALLAS.length);
});

/**
 * Todos los valores que el árbol pone para una propiedad de estilo.
 *
 * Genérica y no solo para `maxWidth` porque la adaptación son tres cosas
 * —el tope de ancho, el margen y el centrado— y comprobar únicamente la
 * primera dejaba pasar que `PantallaBase` volviera al margen fijo o dejara de
 * centrar. Lo descubrió la batería de mutación, que es donde se nota que una
 * prueba mira menos de lo que su nombre promete.
 */
function valoresDeEstilo(nodo: unknown, propiedad: string): unknown[] {
  const encontrados: unknown[] = [];

  const recorrer = (elemento: {
    props?: Record<string, unknown>;
    children?: readonly unknown[];
  }): void => {
    const valor = estiloPlano(elemento.props?.style)[propiedad];
    if (valor !== undefined) encontrados.push(valor);
    for (const hijo of elemento.children ?? []) {
      if (typeof hijo === 'object' && hijo !== null) {
        recorrer(hijo as Parameters<typeof recorrer>[0]);
      }
    }
  };

  if (typeof nodo === 'object' && nodo !== null) recorrer(nodo as Parameters<typeof recorrer>[0]);
  return encontrados;
}

describe.each(PANTALLAS)('%s', (_nombre, Componente) => {
  it.each(TAMANOS)('en %s no estira el texto a lo ancho', async (_donde, ancho, alto) => {
    const { unmount } = montar(Componente, ancho, alto);
    // Las pantallas montan la sincronización de forma asíncrona: sin esperar
    // se mediría un árbol vacío y la prueba pasaría sin ver nada.
    await screen.findByRole('header');

    const maximos = valoresDeEstilo(screen.UNSAFE_root, 'maxWidth');
    columnas += maximos.length;

    // Hay una columna, y no es más ancha de lo que se puede leer. Una
    // pantalla que se pintara por su cuenta no tendría ninguna y caería aquí.
    expect(maximos.length).toBeGreaterThan(0);
    for (const maximo of maximos) {
      expect(maximo).toBeLessThanOrEqual(ANCHO_MAXIMO_LECTURA);
    }
    // Y coincide con lo que la regla dice para este tamaño: así, cambiar la
    // regla y olvidarse de una pantalla se nota.
    expect(maximos).toContain(medidaDe(ancho, alto).anchoDeContenido);

    unmount();
  });

  it.each(TAMANOS)('en %s usa el margen que le toca', async (_donde, ancho, alto) => {
    // El margen es la mitad de la adaptación en un teléfono pequeño: con el
    // holgado, un iPhone SE pierde 48 de sus 320 puntos de ancho.
    const { unmount } = montar(Componente, ancho, alto);
    await screen.findByRole('header');

    expect(valoresDeEstilo(screen.UNSAFE_root, 'paddingHorizontal')).toContain(
      medidaDe(ancho, alto).margenLateral,
    );

    unmount();
  });

  it.each(TAMANOS)('en %s centra la columna solo si sobra sitio', async (_donde, ancho, alto) => {
    // Sin centrar, en una tableta el texto queda pegado al borde izquierdo con
    // medio palmo de fondo vacío a la derecha, que es exactamente «estirar la
    // interfaz móvil sin adaptación» con otra forma.
    const { unmount } = montar(Componente, ancho, alto);
    await screen.findByRole('header');

    const centrados = valoresDeEstilo(screen.UNSAFE_root, 'alignSelf').filter(
      (valor) => valor === 'center',
    );

    if (medidaDe(ancho, alto).seCentra) {
      expect(centrados.length).toBeGreaterThan(0);
    } else {
      expect(centrados).toHaveLength(0);
    }

    unmount();
  });
});
