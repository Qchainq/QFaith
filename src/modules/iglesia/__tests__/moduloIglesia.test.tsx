// Recorrido del módulo Iglesia por pantalla.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type {
  FilaEvento,
  FilaIglesia,
  FilaInscripcion,
  FilaMembresia,
  FilaMentoria,
  RepositorioIglesia,
} from '@shared/services/supabase/repositorioIglesia';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar } from '@shared/testing/renderizar';

import { IglesiaContenedor } from '../screens/IglesiaContenedor';

const MARTA = 'usuario-marta';

const IGLESIA: FilaIglesia = {
  id: 'iglesia-1',
  name: 'Iglesia de prueba',
  slug: 'iglesia-de-prueba',
  description: null,
  city: 'Madrid',
  country_code: 'ES',
};

let membresias: FilaMembresia[];
let eventos: FilaEvento[];
let inscripciones: FilaInscripcion[];
let mentorias: FilaMentoria[];

function repositorio(): RepositorioIglesia {
  return {
    buscarPorCodigo: async (slug) => (slug === IGLESIA.slug ? IGLESIA : null),
    misMembresias: async () => membresias,
    iglesiasPorId: async (ids) => (ids.includes(IGLESIA.id) ? [IGLESIA] : []),
    solicitarIngreso: async ({ iglesiaId, usuarioId }) => {
      const nueva: FilaMembresia = {
        id: 'membresia-1',
        church_id: iglesiaId,
        user_id: usuarioId,
        role: 'visitor',
        membership_status: 'pending',
        joined_at: null,
      };
      membresias = [...membresias, nueva];
      return nueva;
    },
    abandonar: async ({ membresiaId }) => {
      membresias = membresias.map((fila) =>
        fila.id === membresiaId ? { ...fila, membership_status: 'left' } : fila,
      );
      return membresias.find((fila) => fila.id === membresiaId) ?? null;
    },
    grupos: async () => [],
    eventos: async () => eventos,
    misInscripciones: async () => inscripciones,
    inscribirse: async ({ eventoId, usuarioId }) => {
      const nueva: FilaInscripcion = {
        id: 'inscripcion-1',
        event_id: eventoId,
        user_id: usuarioId,
        status: 'registered',
      };
      inscripciones = [...inscripciones, nueva];
      return nueva;
    },
    anularInscripcion: async ({ eventoId }) => {
      inscripciones = inscripciones.filter((fila) => fila.event_id !== eventoId);
      return null;
    },
    mentorias: async () => mentorias,
    terminarMentoria: async ({ mentoriaId }) => {
      mentorias = mentorias.map((fila) =>
        fila.id === mentoriaId ? { ...fila, status: 'ended' } : fila,
      );
      return null;
    },
    compartir: async () => {
      throw new Error('no usado en este recorrido');
    },
    comparticionesDe: async () => [],
    revocar: async () => null,
    recibidas: async () => [],
  };
}

beforeEach(() => {
  membresias = [];
  eventos = [];
  inscripciones = [];
  mentorias = [];
  useEstadoSesion
    .getState()
    .abrirSesion({ id: MARTA, correo: 'marta@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(() => {
  useEstadoSesion.getState().cerrarSesion();
});

const montar = () => renderizar(<IglesiaContenedor repositorio={repositorio()} />);

const conMembresiaActiva = () => {
  membresias = [
    {
      id: 'membresia-1',
      church_id: IGLESIA.id,
      user_id: MARTA,
      role: 'member',
      membership_status: 'active',
      joined_at: '2026-01-01T00:00:00.000Z',
    },
  ];
};

describe('la garantía', () => {
  it('se lee antes de decidir nada, no en un aviso legal', async () => {
    montar();

    expect(
      await screen.findByText(/nunca puede ver tu diario, tus oraciones privadas/),
    ).toBeTruthy();
  });

  it('el estado vacío no presiona para unirse a nada', async () => {
    montar();

    // «nada de lo tuyo depende de esto» es la frase que importa: sin iglesia
    // la aplicación sigue siendo entera.
    expect(await screen.findByText(/nada de lo tuyo depende de esto/)).toBeTruthy();
  });
});

describe('unirse', () => {
  it('un código que no existe lo dice, y no deja nada a medias', async () => {
    montar();

    fireEvent.changeText(await screen.findByLabelText('Código de la iglesia'), 'no-existe');
    fireEvent.press(screen.getByRole('button', { name: 'Buscar por código' }));

    expect(await screen.findByText('No hay ninguna iglesia con ese código.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Solicitar unirme' })).toBeNull();
  });

  it('la solicitud queda pendiente: unirse no es un acto unilateral', async () => {
    montar();

    fireEvent.changeText(await screen.findByLabelText('Código de la iglesia'), 'iglesia-de-prueba');
    fireEvent.press(screen.getByRole('button', { name: 'Buscar por código' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Solicitar unirme' }));

    expect(await screen.findByText(/Tu solicitud está pendiente/)).toBeTruthy();
  });

  it('escribir otro código descarta el resultado anterior', async () => {
    // Sin esto se podría acabar solicitando entrar en una iglesia distinta de
    // la que se acaba de teclear.
    montar();

    const campo = await screen.findByLabelText('Código de la iglesia');
    fireEvent.changeText(campo, 'iglesia-de-prueba');
    fireEvent.press(screen.getByRole('button', { name: 'Buscar por código' }));
    await screen.findByRole('button', { name: 'Solicitar unirme' });

    fireEvent.changeText(campo, 'otra-cosa');

    expect(screen.queryByRole('button', { name: 'Solicitar unirme' })).toBeNull();
  });

  it('salir de la iglesia no necesita el permiso de nadie', async () => {
    conMembresiaActiva();
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Salir de esta iglesia' }));

    await waitFor(() => expect(membresias[0]?.membership_status).toBe('left'));
  });
});

describe('eventos', () => {
  beforeEach(() => {
    conMembresiaActiva();
    eventos = [
      {
        id: 'evento-1',
        church_id: IGLESIA.id,
        title: 'Vigilia de oración',
        description: null,
        location: 'Salón principal',
        starts_at: '2026-09-01T19:00:00.000Z',
        ends_at: null,
        capacity: null,
        registration_required: true,
        status: 'scheduled',
      },
    ];
  });

  it('apuntarse y desapuntarse funciona en los dos sentidos', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Apuntarme' }));
    await waitFor(() => expect(inscripciones).toHaveLength(1));

    fireEvent.press(await screen.findByRole('button', { name: 'Ya no puedo ir' }));
    await waitFor(() => expect(inscripciones).toHaveLength(0));
  });
});

describe('acompañamiento', () => {
  it('dice exactamente qué ve el mentor, y «nada» cuando no ve nada', async () => {
    conMembresiaActiva();
    mentorias = [
      {
        id: 'mentoria-1',
        mentor_user_id: 'elisa',
        mentee_user_id: MARTA,
        status: 'active',
        // Permisos inventados que nadie respalda con una política.
        permissions: { diario: true, todo: true },
      },
    ];
    montar();

    expect(await screen.findByText('Alguien te acompaña')).toBeTruthy();
    expect(screen.getByText('No ve nada tuyo.')).toBeTruthy();
  });

  it('terminar el acompañamiento es cosa de una sola persona', async () => {
    conMembresiaActiva();
    mentorias = [
      {
        id: 'mentoria-1',
        mentor_user_id: 'elisa',
        mentee_user_id: MARTA,
        status: 'active',
        permissions: { oracionesCompartidas: true },
      },
    ];
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Terminar' }));

    await waitFor(() => expect(mentorias[0]?.status).toBe('ended'));
  });
});
