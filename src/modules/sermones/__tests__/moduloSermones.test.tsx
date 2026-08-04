// Recorrido del módulo de Sermones con el almacén, el motor y el cifrado
// reales, y un repositorio de Iglesia inyectado para los sermones publicados.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { crearSincronizacionDePrueba } from '@modules/sincronizacion/__tests__/sincronizacionDePrueba';

import {
  ProveedorSincronizacion,
  type Sincronizacion,
} from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  bloquear,
  inicializarCuenta,
  olvidarDispositivo,
} from '@shared/services/keys/servicioClaves';
import type {
  FilaMembresia,
  FilaSermon,
  RepositorioIglesia,
} from '@shared/services/supabase/repositorioIglesia';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar } from '@shared/testing/renderizar';

import { SermonesContenedor } from '../screens/SermonesContenedor';

const USUARIO = 'usuario-1';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

const SERMON: FilaSermon = {
  id: 'sermon-1',
  church_id: 'iglesia-1',
  title: 'Sobre el perdón',
  speaker_name: 'Pablo',
  sermon_date: '2026-08-30',
  public_summary: 'Un recorrido por Mateo 18.',
  bible_references: ['Mateo 18:21-35'],
  audio_path: null,
  video_url: null,
  publication_status: 'published',
};

const MEMBRESIA: FilaMembresia = {
  id: 'membresia-1',
  church_id: 'iglesia-1',
  user_id: USUARIO,
  role: 'member',
  membership_status: 'active',
  joined_at: '2026-01-01T00:00:00.000Z',
};

let servidor: ServidorEnMemoria;
let sincronizacion: Sincronizacion;

const repositorioIglesia = (): RepositorioIglesia =>
  ({
    buscarPorCodigo: async () => null,
    misMembresias: async () => [MEMBRESIA],
    iglesiasPorId: async () => [
      {
        id: 'iglesia-1',
        name: 'Iglesia de prueba',
        slug: 'iglesia-de-prueba',
        description: null,
        city: null,
        country_code: null,
      },
    ],
    solicitarIngreso: async () => MEMBRESIA,
    abandonar: async () => null,
    grupos: async () => [],
    eventos: async () => [],
    misInscripciones: async () => [],
    inscribirse: async () => null,
    anularInscripcion: async () => null,
    mentorias: async () => [],
    terminarMentoria: async () => null,
    sermones: async () => [SERMON],
    compartir: async () => {
      throw new Error('no usado');
    },
    comparticionesDe: async () => [],
    revocar: async () => null,
    recibidas: async () => [],
  }) satisfies RepositorioIglesia;

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });

  const almacen = crearAlmacenEnMemoria();
  servidor = crearServidorEnMemoria();
  sincronizacion = crearSincronizacionDePrueba({
    almacen,
    usuarioId: USUARIO,
    remoto: servidor,
    dispositivoId: 'dispositivo-1',
  });

  useEstadoSesion
    .getState()
    .abrirSesion({ id: USUARIO, correo: 'marta@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(() => {
  useEstadoSesion.getState().cerrarSesion();
});

const montar = () =>
  renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <SermonesContenedor repositorioIglesia={repositorioIglesia()} />
    </ProveedorSincronizacion>,
  );

describe('la promesa del módulo', () => {
  it('dice que la nota es privada antes de que nadie escriba', async () => {
    montar();

    // Es lo que permite tomar notas con libertad durante una predicación.
    expect(
      await screen.findByText('Lo que anotes aquí es tuyo. Ni el pastor que predicó puede leerlo.'),
    ).toBeTruthy();
  });
});

describe('sermones publicados', () => {
  it('muestra el que publicó la iglesia', async () => {
    montar();

    expect(await screen.findByText('Sobre el perdón')).toBeTruthy();
    expect(screen.getByText(/Pablo/)).toBeTruthy();
  });

  it('se puede escribir una nota sobre él, y queda atada al sermón', async () => {
    montar();
    await screen.findByText('Sobre el perdón');

    // El primer botón de escribir es el del sermón; el segundo, el de notas
    // sueltas.
    fireEvent.press(screen.getAllByRole('button', { name: 'Escribir una nota' })[0]!);
    fireEvent.changeText(
      await screen.findByLabelText('¿Qué te llevas de aquí?'),
      'Tengo que hablar con mi hermano.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () =>
      expect((await sincronizacion.almacen.listar('sermon_notes'))[0]?.metadatos.sermon_id).toBe(
        'sermon-1',
      ),
    );
  });
});

describe('notas sueltas', () => {
  it('se puede escribir sin que haya ningún sermón detrás', async () => {
    montar();
    await screen.findByText('Sobre el perdón');

    fireEvent.press(screen.getAllByRole('button', { name: 'Escribir una nota' })[1]!);
    fireEvent.changeText(await screen.findByLabelText('¿Qué te llevas de aquí?'), 'Un apunte');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Un apunte')).toBeTruthy();
  });

  it('una nota vacía no guarda nada y lo dice sin reprochar', async () => {
    montar();
    await screen.findByText('Sobre el perdón');

    fireEvent.press(screen.getAllByRole('button', { name: 'Escribir una nota' })[1]!);
    fireEvent.changeText(await screen.findByLabelText('¿Qué te llevas de aquí?'), '   ');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Escribe algo antes de guardar.')).toBeTruthy();
  });
});

describe('lo que te propusiste', () => {
  it('se añade, se marca y se puede desmarcar', async () => {
    montar();
    await screen.findByText('Sobre el perdón');

    fireEvent.press(screen.getByRole('button', { name: 'Añadir algo que quieras hacer' }));
    fireEvent.changeText(await screen.findByLabelText('¿Qué vas a hacer?'), 'Llamar a mi hermano');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Llamar a mi hermano')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Ya lo hice' }));
    // Al marcarla desaparece de las pendientes: la lista no acumula deudas.
    await waitFor(() => expect(screen.queryByText('Llamar a mi hermano')).toBeNull());
  });

  it('el estado vacío no reprocha nada', async () => {
    montar();

    expect(await screen.findByText('No tienes nada pendiente.')).toBeTruthy();
  });
});

describe('lo que ve el servidor', () => {
  it('nada de la nota viaja legible', async () => {
    montar();
    await screen.findByText('Sobre el perdón');

    fireEvent.press(screen.getAllByRole('button', { name: 'Escribir una nota' })[1]!);
    fireEvent.changeText(
      await screen.findByLabelText('¿Qué te llevas de aquí?'),
      'Me sentí señalado y creo que con razón.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Me sentí señalado y creo que con razón.');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('señalado');
    expect(crudo).not.toContain('razón');
    expect(crudo).toContain('sermon_notes');
  });
});
