// Recorrido del módulo de Perfil por pantalla.
//
// El repositorio se inyecta en memoria: aquí se comprueba que las pantallas,
// los hooks y los casos de uso encajan, no que PostgREST funcione.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type {
  FilaAjustes,
  FilaDispositivo,
  FilaEliminacion,
  FilaPerfil,
  RepositorioPerfil,
} from '@shared/services/supabase/repositorioPerfil';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar } from '@shared/testing/renderizar';

import { PerfilContenedor } from '../screens/PerfilContenedor';

const AHORA = new Date('2026-08-03T00:00:00.000Z');

let perfil: FilaPerfil;
let ajustes: FilaAjustes;
let dispositivos: FilaDispositivo[];
let pendiente: FilaEliminacion | null;
// El prefijo `mock` es lo que permite a Jest referenciarla desde la fábrica
// del módulo simulado.
let mockBiometriaDisponible: boolean;

function repositorio(): RepositorioPerfil {
  return {
    leerPerfil: async () => perfil,
    guardarPerfil: async (parametros) => {
      perfil = {
        ...perfil,
        display_name: parametros.nombre,
        language_code: parametros.idioma,
        timezone: parametros.zonaHoraria,
        country_code: parametros.pais,
        birth_year: parametros.anoNacimiento,
      };
      return perfil;
    },
    leerAjustes: async () => ajustes,
    guardarAjustes: async (_usuarioId, cambios) => {
      // El caso de uso comprueba la biometría antes de llegar aquí; este
      // repositorio solo guarda lo que le mandan.
      ajustes = { ...ajustes, ...(cambios as Partial<FilaAjustes>) };
      return ajustes;
    },
    listarDispositivos: async () => dispositivos,
    revocarDispositivo: async ({ dispositivoId }) => {
      dispositivos = dispositivos.map((dispositivo) =>
        dispositivo.id === dispositivoId
          ? { ...dispositivo, status: 'revoked', revoked_at: AHORA.toISOString() }
          : dispositivo,
      );
      return dispositivos.find((dispositivo) => dispositivo.id === dispositivoId) ?? null;
    },
    solicitarEliminacion: async ({ diasDeGracia }) => {
      pendiente = {
        id: 'solicitud-1',
        requested_at: AHORA.toISOString(),
        scheduled_for: new Date(AHORA.getTime() + diasDeGracia * 86_400_000).toISOString(),
        status: 'pendiente',
      };
      return pendiente;
    },
    eliminacionPendiente: async () => pendiente,
    cancelarEliminacion: async () => {
      const anterior = pendiente;
      pendiente = null;
      return anterior === null ? null : { ...anterior, status: 'cancelada' };
    },
  };
}

jest.mock('@shared/services/keys/almacenSeguro', () => ({
  consultarBiometria: async () => ({
    disponible: mockBiometriaDisponible,
    configurada: mockBiometriaDisponible,
  }),
}));

beforeEach(() => {
  perfil = {
    id: 'usuario-1',
    display_name: 'Ana',
    language_code: 'es',
    timezone: 'Europe/Madrid',
    country_code: 'ES',
    birth_year: 1990,
    onboarding_completed: true,
  };
  ajustes = {
    user_id: 'usuario-1',
    theme: 'system',
    font_scale: 1,
    notifications_enabled: true,
    analytics_enabled: false,
    biometric_lock_enabled: false,
    auto_lock_seconds: 60,
    cloud_backup_enabled: true,
    wifi_only_downloads: false,
    notification_detail: 'generico',
    quiet_from_minute: 1320,
    quiet_to_minute: 420,
    max_spiritual_per_day: 3,
    max_summaries_per_day: 1,
    max_promotional_per_week: 1,
    promotional_consent: false,
  };
  dispositivos = [
    {
      id: 'dispositivo-1',
      device_name: 'Móvil de Ana',
      platform: 'ios',
      status: 'active',
      last_seen_at: '2026-08-01T10:00:00.000Z',
      revoked_at: null,
    },
    {
      id: 'dispositivo-2',
      device_name: 'Tablet vieja',
      platform: 'android',
      status: 'active',
      last_seen_at: '2026-05-01T10:00:00.000Z',
      revoked_at: null,
    },
  ];
  pendiente = null;
  mockBiometriaDisponible = true;

  useEstadoSesion
    .getState()
    .abrirSesion({ id: 'usuario-1', correo: 'ana@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(() => {
  useEstadoSesion.getState().cerrarSesion();
});

const montar = (alCerrarSesion?: () => void) =>
  renderizar(
    <PerfilContenedor
      repositorio={repositorio()}
      ahora={AHORA}
      {...(alCerrarSesion === undefined ? {} : { alCerrarSesion })}
    />,
  );

describe('portada', () => {
  it('muestra el nombre y el correo de la cuenta', async () => {
    montar();

    expect(await screen.findByText('Ana')).toBeTruthy();
    expect(screen.getByText('ana@ejemplo.invalid')).toBeTruthy();
  });

  it('cerrar sesión avisa a quien descarta las claves', async () => {
    const cerrar = jest.fn();
    montar(cerrar);

    fireEvent.press(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    // La pantalla no descarta claves por su cuenta: eso vive en el arranque.
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});

describe('editar el perfil', () => {
  it('guarda el nombre nuevo y vuelve a la portada', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Editar perfil' }));
    fireEvent.changeText(
      await screen.findByLabelText('¿Cómo quieres que te llamemos?'),
      'Ana María',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Ana María')).toBeTruthy();
  });

  it('un país mal escrito no guarda y lo explica en el propio campo', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Editar perfil' }));
    fireEvent.changeText(await screen.findByLabelText('País (dos letras)'), 'E');
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('El país son dos letras, como ES o MX.')).toBeTruthy();
  });
});

describe('configuración', () => {
  it('cambiar el tema se guarda', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Tema: El del sistema' }));

    expect(await screen.findByRole('button', { name: 'Tema: Claro' })).toBeTruthy();
  });

  it('la analítica aparece apagada y dice que no incluye lo que escribes', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    const interruptor = await screen.findByLabelText('Compartir estadísticas de uso anónimas');
    expect(interruptor.props.value).toBe(false);
    expect(screen.getByText(/Nunca incluye nada de lo que escribes/)).toBeTruthy();
  });

  it('los ajustes de aviso solo aparecen si las notificaciones están encendidas', async () => {
    // Seis controles que no hacen nada es de las formas más rápidas de que
    // alguien deje de fiarse de una pantalla de ajustes.
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    expect(await screen.findByLabelText('Decir de qué es el aviso')).toBeTruthy();

    // Un interruptor no se «pulsa»: emite `valueChange`. Con `press` la
    // prueba pasaba por no hacer nada, que es el falso verde de siempre.
    fireEvent(screen.getByLabelText('Recordatorios y avisos'), 'valueChange', false);

    await waitFor(() => {
      expect(screen.queryByLabelText('Decir de qué es el aviso')).toBeNull();
    });
  });

  it('la vista previa nace apagada y explica qué enseña y qué no', async () => {
    // Privacidad por defecto, y la nota tiene que dejar claro el límite: lo
    // que se gana es saber de qué va el aviso, nunca ver lo que se escribió.
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    const interruptor = await screen.findByLabelText('Decir de qué es el aviso');
    expect(interruptor.props.value).toBe(false);
    expect(screen.getByText(/Nunca muestra lo que has escrito/)).toBeTruthy();
  });

  it('el horario de silencio se puede cambiar y se guarda', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    fireEvent.press(await screen.findByRole('button', { name: 'Sin avisos desde: 22:00 – 07:00' }));

    expect(
      await screen.findByRole('button', { name: 'Sin avisos desde: 23:00 – 07:00' }),
    ).toBeTruthy();
  });

  it('el techo diario se puede bajar, incluso hasta ninguno', async () => {
    // Cero es una elección legítima: «no quiero ninguno de estos». Que exista
    // como opción es lo que hace que el resto no se sienta impuesto.
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    fireEvent.press(await screen.findByRole('button', { name: 'Como mucho 3 avisos al día' }));
    expect(await screen.findByRole('button', { name: 'Como mucho 2 avisos al día' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Como mucho 2 avisos al día' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Como mucho 1 aviso al día' }));

    expect(await screen.findByRole('button', { name: 'Ningún aviso de este tipo' })).toBeTruthy();
  });

  it('las novedades nacen apagadas: exigen consentimiento explícito', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    expect((await screen.findByLabelText('Novedades de QFaith')).props.value).toBe(false);
  });

  it('sin biometría en el dispositivo, el interruptor no se queda encendido en falso', async () => {
    mockBiometriaDisponible = false;
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    fireEvent(await screen.findByLabelText('Pedir huella o rostro al abrir'), 'valueChange', true);

    expect(
      await screen.findByText('Este dispositivo no tiene huella ni reconocimiento facial.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Pedir huella o rostro al abrir').props.value).toBe(false);
  });

  it('«no bloquear por inactividad» es una opción ofrecida, no un descuido', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Configuración' }));

    fireEvent.press(await screen.findByRole('button', { name: 'No bloquear por inactividad' }));

    // Se espera al efecto: mirar el fotograma siguiente comprobaría el estado
    // anterior a la mutación y pasaría siempre.
    await waitFor(() => expect(ajustes.auto_lock_seconds).toBe(0));
  });
});

describe('dispositivos', () => {
  it('el dispositivo actual no ofrece retirar el acceso', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Dispositivos' }));
    await screen.findByText(/Móvil de Ana/);

    // Solo hay un botón de retirar: el de la tablet.
    expect(screen.getAllByRole('button', { name: 'Retirar el acceso' })).toHaveLength(1);
    expect(screen.getByText(/Este dispositivo/)).toBeTruthy();
  });

  it('retirar el acceso a otro dispositivo lo marca como revocado', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Dispositivos' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Retirar el acceso' }));

    expect(await screen.findByText('Acceso retirado')).toBeTruthy();
    // No se borra la fila: un dispositivo borrado volvería a darse de alta
    // solo con abrir la aplicación.
    expect(dispositivos).toHaveLength(2);
  });
});

describe('eliminar la cuenta', () => {
  it('dice la verdad incómoda antes de que nadie decida', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Eliminar la cuenta' }));

    expect(await screen.findByText(/tampoco podremos devolvértelo/)).toBeTruthy();
  });

  it('pide confirmación y luego programa el borrado a 30 días', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Eliminar la cuenta' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Solicitar la eliminación' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Sí, eliminar mi cuenta' }));

    expect(await screen.findByText('Tu cuenta se eliminará dentro de 30 días.')).toBeTruthy();
  });

  it('se puede cancelar, y esa es la razón de que exista el plazo', async () => {
    pendiente = {
      id: 'solicitud-1',
      requested_at: AHORA.toISOString(),
      scheduled_for: new Date(AHORA.getTime() + 30 * 86_400_000).toISOString(),
      status: 'pendiente',
    };
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Eliminar la cuenta' }));
    fireEvent.press(await screen.findByRole('button', { name: 'Cancelar la eliminación' }));

    expect(await screen.findByRole('button', { name: 'Solicitar la eliminación' })).toBeTruthy();
    expect(pendiente).toBeNull();
  });
});
