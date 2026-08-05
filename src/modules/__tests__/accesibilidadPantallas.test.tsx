// Accesibilidad de las pantallas, barrida de una vez.
//
// El Documento 14 pide etiquetas para lectores de pantalla, áreas táctiles
// suficientes y estados que no dependan solo del color. Comprobarlo pantalla a
// pantalla se olvida en cuanto se añade una; barrerlas todas desde un sitio no.
//
// Lo que no se puede medir aquí —contraste, orden de navegación real, cómo
// suena en VoiceOver— tiene sus propias pruebas o hay que probarlo en un
// dispositivo. Esto cubre lo que sí es medible, que es más de lo que suele
// comprobarse.
import { screen } from '@testing-library/react-native';

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
import {
  demasiadoPequenos,
  interactivosDe,
  sinNombre,
  sinRol,
} from '@shared/testing/accesibilidad';
import { renderizar } from '@shared/testing/renderizar';

jest.mock('@shared/services/supabase/rest', () => ({
  crearClienteRest: () => ({
    peticion: async () => ({ estado: 200, filas: [], codigo: null }),
    comoError: () => new Error('sin red'),
  }),
}));

/** Todas las pantallas que una persona puede abrir. */
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

beforeEach(() => {
  useEstadoSesion
    .getState()
    .abrirSesion({ id: 'usuario-1', correo: 'ana@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(() => {
  useEstadoSesion.getState().cerrarSesion();
});

function montar(Componente: (typeof PANTALLAS)[number][1]) {
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
 * Cuántos elementos interactivos encuentra el barrido en total.
 *
 * Existe porque todo lo de abajo comprueba listas de incumplimientos, y una
 * lista vacía pasa igual cuando no hay nada que revisar que cuando está todo
 * bien. Si el detector dejara de reconocer los botones —un cambio en React
 * Native, un componente nuevo—, las sesenta pruebas seguirían en verde sin
 * mirar nada. Esta no.
 */
let encontrados = 0;

afterAll(() => {
  expect(encontrados).toBeGreaterThan(20);
});

describe.each(PANTALLAS)('%s', (_nombre, Componente) => {
  it('todo lo que se puede pulsar tiene nombre para el lector de pantalla', async () => {
    const { unmount } = montar(Componente);
    // Las pantallas montan la sincronización de forma asíncrona: sin esperar,
    // se estaría midiendo un árbol vacío y la prueba pasaría sin ver nada.
    await screen.findByRole('header');

    const interactivos = interactivosDe(screen.UNSAFE_root);
    encontrados += interactivos.length;
    const anonimos = sinNombre(interactivos);

    // Un botón sin nombre lo anuncia VoiceOver como «botón» y nada más: la
    // persona que no ve la pantalla no puede saber qué hace.
    expect(anonimos.map((e) => e.rol)).toEqual([]);
    unmount();
  });

  it('todo lo que se puede pulsar declara su papel', async () => {
    const { unmount } = montar(Componente);
    await screen.findByRole('header');

    // Sin papel, el lector no dice que sea pulsable y quien navega por
    // gestos se lo salta.
    expect(sinRol(interactivosDe(screen.UNSAFE_root)).map((e) => e.nombre)).toEqual([]);
    unmount();
  });

  it('ninguna área táctil se declara por debajo del mínimo', async () => {
    const { unmount } = montar(Componente);
    await screen.findByRole('header');

    // 44 puntos es el mínimo de las guías de Apple y el de WCAG 2.5.5. Por
    // debajo, quien tiene temblor o dedos grandes falla el objetivo.
    expect(demasiadoPequenos(interactivosDe(screen.UNSAFE_root)).map((e) => e.nombre)).toEqual([]);
    unmount();
  });

  it('la pantalla tiene una cabecera que la nombra', async () => {
    // Es lo primero que anuncia el lector al entrar. Sin ella, quien no ve la
    // pantalla no sabe dónde está.
    const { unmount } = montar(Componente);

    expect(await screen.findByRole('header')).toBeTruthy();
    unmount();
  });
});
