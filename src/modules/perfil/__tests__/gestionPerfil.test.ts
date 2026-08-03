// Casos de uso de Perfil y Configuración.
//
// Lo que se comprueba aquí son sobre todo las tres reglas de seguridad que no
// pueden vivir en una pantalla: biometría que no se puede encender en falso,
// dispositivo actual que no se revoca a sí mismo y borrado que siempre pasa
// por el periodo de gracia.
import type {
  FilaAjustes,
  FilaDispositivo,
  FilaEliminacion,
  FilaPerfil,
  RepositorioPerfil,
} from '@shared/services/supabase/repositorioPerfil';

import { DIAS_DE_GRACIA, diasHastaElBorrado } from '../models/perfil';
import {
  cargarAjustes,
  guardarAjustes,
  guardarPerfil,
  listarDispositivos,
  revocarDispositivo,
  solicitarEliminacion,
} from '../use-cases/gestionPerfil';

const PERFIL: FilaPerfil = {
  id: 'usuario-1',
  display_name: 'Ana',
  language_code: 'es',
  timezone: 'Europe/Madrid',
  country_code: 'ES',
  birth_year: 1990,
  onboarding_completed: true,
};

const AJUSTES: FilaAjustes = {
  user_id: 'usuario-1',
  theme: 'dark',
  font_scale: 1,
  notifications_enabled: true,
  analytics_enabled: false,
  biometric_lock_enabled: false,
  auto_lock_seconds: 60,
  cloud_backup_enabled: true,
  wifi_only_downloads: false,
};

interface Espia {
  perfilGuardado?: unknown;
  ajustesGuardados?: Record<string, unknown>;
  revocado?: unknown;
  eliminacionPedida?: unknown;
}

function repositorioFalso(espia: Espia = {}, sobrescribir: Partial<RepositorioPerfil> = {}) {
  const repositorio: RepositorioPerfil = {
    leerPerfil: async () => PERFIL,
    guardarPerfil: async (parametros) => {
      espia.perfilGuardado = parametros;
      return {
        ...PERFIL,
        display_name: parametros.nombre,
        country_code: parametros.pais,
        birth_year: parametros.anoNacimiento,
      };
    },
    leerAjustes: async () => AJUSTES,
    guardarAjustes: async (_usuarioId, cambios) => {
      espia.ajustesGuardados = { ...cambios };
      return { ...AJUSTES, ...(cambios as Partial<FilaAjustes>) };
    },
    listarDispositivos: async () => [],
    revocarDispositivo: async (parametros) => {
      espia.revocado = parametros;
      return null;
    },
    solicitarEliminacion: async (parametros) => {
      espia.eliminacionPedida = parametros;
      const solicitada = new Date('2026-08-03T00:00:00.000Z');
      const programada = new Date(solicitada.getTime() + parametros.diasDeGracia * 86_400_000);
      return {
        id: 'solicitud-1',
        requested_at: solicitada.toISOString(),
        scheduled_for: programada.toISOString(),
        status: 'pendiente',
      } satisfies FilaEliminacion;
    },
    eliminacionPendiente: async () => null,
    cancelarEliminacion: async () => null,
    ...sobrescribir,
  };
  return repositorio;
}

const conBiometria = (disponible: boolean, configurada: boolean) => async () => ({
  disponible,
  configurada,
});

describe('guardar el perfil', () => {
  it('normaliza el país a mayúsculas y recorta espacios', async () => {
    const espia: Espia = {};
    await guardarPerfil(repositorioFalso(espia), 'usuario-1', {
      nombre: '  Ana  ',
      idioma: 'es',
      zonaHoraria: 'Europe/Madrid',
      pais: ' es ',
      anoNacimiento: 1990,
    });

    expect(espia.perfilGuardado).toMatchObject({ nombre: 'Ana', pais: 'ES' });
  });

  it('un nombre en blanco se guarda como «sin nombre», no como cadena vacía', async () => {
    const espia: Espia = {};
    await guardarPerfil(repositorioFalso(espia), 'usuario-1', {
      nombre: '   ',
      idioma: 'es',
      zonaHoraria: 'UTC',
      pais: null,
      anoNacimiento: null,
    });

    // Guardar «» dejaría una fila que dice que la persona se llama «».
    expect(espia.perfilGuardado).toMatchObject({ nombre: null });
  });

  it('un país mal escrito se rechaza con un mensaje traducible', async () => {
    await expect(
      guardarPerfil(repositorioFalso(), 'usuario-1', {
        nombre: null,
        idioma: 'es',
        zonaHoraria: 'UTC',
        pais: 'España',
        anoNacimiento: null,
      }),
    ).rejects.toMatchObject({ claveMensaje: 'perfil.errores.paisInvalido' });
  });

  it('un año imposible se rechaza antes de llegar al servidor', async () => {
    const espia: Espia = {};
    await expect(
      guardarPerfil(repositorioFalso(espia), 'usuario-1', {
        nombre: null,
        idioma: 'es',
        zonaHoraria: 'UTC',
        pais: null,
        anoNacimiento: 1750,
      }),
    ).rejects.toMatchObject({ claveMensaje: 'perfil.errores.anoInvalido' });

    expect(espia.perfilGuardado).toBeUndefined();
  });
});

describe('bloqueo biométrico', () => {
  it('no se puede encender en un dispositivo sin hardware', async () => {
    const espia: Espia = {};

    await expect(
      guardarAjustes(
        repositorioFalso(espia),
        'usuario-1',
        { bloqueoBiometrico: true },
        conBiometria(false, false),
      ),
    ).rejects.toMatchObject({ claveMensaje: 'perfil.errores.biometriaNoDisponible' });

    // Y no se guarda nada: un interruptor encendido que no protege sería peor
    // que no tenerlo.
    expect(espia.ajustesGuardados).toBeUndefined();
  });

  it('con hardware pero sin huella registrada, dice qué hacer', async () => {
    await expect(
      guardarAjustes(
        repositorioFalso(),
        'usuario-1',
        { bloqueoBiometrico: true },
        conBiometria(true, false),
      ),
    ).rejects.toMatchObject({ claveMensaje: 'perfil.errores.biometriaSinConfigurar' });
  });

  it('con biometría configurada se guarda', async () => {
    const espia: Espia = {};
    const ajustes = await guardarAjustes(
      repositorioFalso(espia),
      'usuario-1',
      { bloqueoBiometrico: true },
      conBiometria(true, true),
    );

    expect(espia.ajustesGuardados).toEqual({ biometric_lock_enabled: true });
    expect(ajustes.bloqueoBiometrico).toBe(true);
  });

  it('apagarlo nunca se bloquea: nadie puede quedarse encerrado fuera', async () => {
    const espia: Espia = {};
    await guardarAjustes(
      repositorioFalso(espia),
      'usuario-1',
      { bloqueoBiometrico: false },
      conBiometria(false, false),
    );

    expect(espia.ajustesGuardados).toEqual({ biometric_lock_enabled: false });
  });
});

describe('plazo de bloqueo', () => {
  it('un plazo fuera de rango se recorta antes de enviarlo', async () => {
    const espia: Espia = {};
    await guardarAjustes(repositorioFalso(espia), 'usuario-1', { segundosBloqueo: 99_999 });

    // El esquema solo acepta hasta 3600; enviarlo entero daría un 400.
    expect(espia.ajustesGuardados).toEqual({ auto_lock_seconds: 3600 });
  });

  it('solo se envían los campos que cambian', async () => {
    const espia: Espia = {};
    await guardarAjustes(repositorioFalso(espia), 'usuario-1', { tema: 'light' });

    expect(espia.ajustesGuardados).toEqual({ theme: 'light' });
  });
});

describe('ajustes por defecto', () => {
  it('sin fila guardada, la analítica está apagada', async () => {
    // Privacidad por defecto (Documento 5): quien nunca entró en ajustes no
    // debería estar enviando nada.
    const ajustes = await cargarAjustes(
      repositorioFalso({}, { leerAjustes: async () => null }),
      'usuario-1',
    );

    expect(ajustes.analitica).toBe(false);
    expect(ajustes.bloqueoBiometrico).toBe(false);
  });
});

describe('dispositivos', () => {
  const filas: readonly FilaDispositivo[] = [
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
      device_name: 'Tablet',
      platform: 'android',
      status: 'active',
      last_seen_at: null,
      revoked_at: null,
    },
  ];

  it('marca cuál es el dispositivo actual', async () => {
    const lista = await listarDispositivos(
      repositorioFalso({}, { listarDispositivos: async () => filas }),
      'usuario-1',
      'dispositivo-1',
    );

    expect(lista.map((dispositivo) => dispositivo.esEste)).toEqual([true, false]);
  });

  it('revocar el dispositivo actual se rechaza: eso es cerrar sesión', async () => {
    const espia: Espia = {};

    await expect(
      revocarDispositivo(repositorioFalso(espia), {
        usuarioId: 'usuario-1',
        dispositivoId: 'dispositivo-1',
        dispositivoActualId: 'dispositivo-1',
      }),
    ).rejects.toMatchObject({ claveMensaje: 'perfil.errores.noRevocarEsteDispositivo' });

    expect(espia.revocado).toBeUndefined();
  });

  it('revocar otro dispositivo sí llega al servidor', async () => {
    const espia: Espia = {};
    await revocarDispositivo(repositorioFalso(espia), {
      usuarioId: 'usuario-1',
      dispositivoId: 'dispositivo-2',
      dispositivoActualId: 'dispositivo-1',
    });

    expect(espia.revocado).toEqual({ usuarioId: 'usuario-1', dispositivoId: 'dispositivo-2' });
  });
});

describe('eliminar la cuenta', () => {
  it('siempre pasa por el periodo de gracia', async () => {
    const espia: Espia = {};
    const solicitud = await solicitarEliminacion(repositorioFalso(espia), 'usuario-1');

    expect(espia.eliminacionPedida).toMatchObject({ diasDeGracia: DIAS_DE_GRACIA });
    expect(diasHastaElBorrado(solicitud, new Date('2026-08-03T00:00:00.000Z'))).toBe(
      DIAS_DE_GRACIA,
    );
  });

  it('el plazo son los mismos 30 días que la papelera', () => {
    // Un plazo distinto para la cuenta y para su contenido solo confundiría a
    // quien intenta entender qué le va a pasar a lo suyo.
    expect(DIAS_DE_GRACIA).toBe(30);
  });

  it('los días que faltan nunca son negativos', () => {
    const solicitud = {
      id: 's',
      solicitadaEn: '2026-01-01T00:00:00.000Z',
      programadaPara: '2026-01-31T00:00:00.000Z',
    };
    expect(diasHastaElBorrado(solicitud, new Date('2026-03-01T00:00:00.000Z'))).toBe(0);
  });
});
