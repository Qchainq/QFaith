// Planes de lectura de punta a punta: catálogo, cifrado, motor y pantallas.
//
// Lo que más se vigila aquí es el tono. Un plan de lectura es donde más fácil
// resulta colar una racha, un porcentaje o un «llevas cinco días sin leer», y
// el invariante 12 no admite ninguna de las tres.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

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
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { renderizar } from '@shared/testing/renderizar';

import { PlanesContenedor } from '../screens/PlanesContenedor';

const USUARIO = 'usuario-1';
const REFLEXION = 'Me cuesta soltar lo que no puedo cambiar.';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

const PLAN = {
  id: 'plan-ansiedad',
  creator_type: 'qfaith',
  title: 'Siete días sobre la ansiedad',
  description: 'Una semana para dejar de cargar solo.',
  language_code: 'es',
  duration_days: 7,
  is_premium: false,
};

const DIAS = [1, 2, 3, 4, 5, 6, 7].map((numero) => ({
  id: `dia-${numero}`,
  plan_id: PLAN.id,
  day_number: numero,
  title: `Día ${numero}`,
  content: `Texto del día ${numero}.`,
  bible_references: [{ libro: 'MAT', capitulo: 6 }],
  reflection_questions: ['¿Qué te preocupa hoy?'],
}));

// El catálogo llega por REST. Se sirve desde aquí, con contenido inventado
// (invariante 15). Se sustituye el cliente entero y no `fetch`: así la prueba
// no depende de que haya configuración de Supabase en el entorno.
const mockPeticion = jest.fn();
jest.mock('@shared/services/supabase/rest', () => ({
  crearClienteRest: () => ({
    peticion: (parametros: unknown) => mockPeticion(parametros),
    comoError: () => new Error('fallo del servidor'),
  }),
}));

let servidor: ServidorEnMemoria;
let sincronizacion: Sincronizacion;

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });

  servidor = crearServidorEnMemoria();
  sincronizacion = crearSincronizacionDePrueba({
    almacen: crearAlmacenEnMemoria(),
    usuarioId: USUARIO,
    remoto: servidor,
  });

  mockPeticion.mockImplementation(({ ruta }: { ruta: string }) => ({
    estado: 200,
    filas: ruta.startsWith('/reading_plan_days')
      ? DIAS
      : ruta.startsWith('/reading_plans')
        ? [PLAN]
        : [],
    codigo: null,
  }));
});

const montar = () =>
  renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
      sincronizarEnSegundoPlano={false}
    >
      <PlanesContenedor />
    </ProveedorSincronizacion>,
  );

const pulsar = async (texto: string | RegExp) => {
  const boton = await screen.findByText(texto);
  await act(async () => {
    fireEvent.press(boton);
  });
};

describe('descubrir y empezar', () => {
  it('el catálogo se enseña con su duración', async () => {
    montar();

    expect(await screen.findByText('Siete días sobre la ansiedad')).toBeTruthy();
    expect(await screen.findByText('7 días')).toBeTruthy();
  });

  it('parte de un estado vacío que no reprocha nada', async () => {
    montar();

    expect(await screen.findByText('Cuando empieces un plan, aparecerá aquí.')).toBeTruthy();
  });

  it('empezar lo mueve a «mis planes» y lo saca de las novedades', async () => {
    montar();
    await pulsar('Empezar este plan');

    expect(await screen.findByText(/Día 1 de 7/)).toBeTruthy();
    // Un plan que ya sigues no se te vuelve a ofrecer como novedad.
    await waitFor(() => {
      expect(screen.queryByText('Empezar este plan')).toBeNull();
    });
  });
});

describe('leer un día', () => {
  it('enseña el pasaje, el texto y las preguntas', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Continuar');

    expect(await screen.findByText('MAT 6')).toBeTruthy();
    expect(await screen.findByText('Texto del día 1.')).toBeTruthy();
    expect(await screen.findByText('¿Qué te preocupa hoy?')).toBeTruthy();
  });

  it('dice que la reflexión es opcional', async () => {
    // Una caja de texto sin más se lee como deber.
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Continuar');

    expect(await screen.findByText('¿Qué te ha dicho hoy? (opcional)')).toBeTruthy();
  });

  it('marcarlo leído avanza un día y cuenta lo leído', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Continuar');
    await pulsar('Marcar como leído');
    await pulsar('Volver');

    expect(await screen.findByText(/Día 2 de 7/)).toBeTruthy();
    // Lo leído, no lo que falta.
    expect(await screen.findByText('1 día leído')).toBeTruthy();
  });

  it('la reflexión no llega en claro al servidor', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Continuar');

    const campo = await screen.findByDisplayValue('');
    await act(async () => {
      fireEvent.changeText(campo, REFLEXION);
    });
    await pulsar('Marcar como leído');

    await act(async () => {
      await sincronizacion.motor.sincronizar();
    });

    const enElServidor = JSON.stringify(servidor.filas());
    expect(enElServidor).not.toContain(REFLEXION);
    expect(enElServidor).not.toContain('soltar');
  });
});

describe('lo que la pantalla nunca dice', () => {
  it('no habla de rachas, de días perdidos ni de porcentajes', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Continuar');
    await pulsar('Marcar como leído');
    await pulsar('Volver');

    // Un plan es un acompañamiento, no un marcador (invariante 12).
    const texto = JSON.stringify(screen.toJSON());
    for (const prohibido of ['racha', 'seguidos', 'perdid', 'pendientes', '%', 'faltan']) {
      expect(texto.toLowerCase()).not.toContain(prohibido);
    }
  });

  it('no urge a nadie a ponerse al día', async () => {
    montar();
    await pulsar('Empezar este plan');

    const texto = JSON.stringify(screen.toJSON()).toLowerCase();
    for (const prohibido of ['al día', 'no pierdas', 'sigue así', 'te queda']) {
      expect(texto).not.toContain(prohibido);
    }
  });
});

describe('dejar un plan a un lado', () => {
  it('pausar y dejarlo están a la vista, no escondidos', async () => {
    // Que cueste encontrarlos empuja a seguir por inercia, y eso es lo
    // contrario de acompañar.
    montar();
    await pulsar('Empezar este plan');

    expect(await screen.findByText('Pausar')).toBeTruthy();
    expect(await screen.findByText('Dejarlo por ahora')).toBeTruthy();
  });

  it('dejarlo no reprocha nada y se puede retomar', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Dejarlo por ahora');

    // El vocabulario no lo trata como un fracaso, y el plan sigue esperando.
    expect(await screen.findByText(/Lo dejaste/)).toBeTruthy();
    expect(await screen.findByText('Tu plan te espera donde lo dejaste.')).toBeTruthy();
    expect(await screen.findByText('Retomar')).toBeTruthy();
  });

  it('retomarlo lo devuelve al día donde estaba', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Continuar');
    await pulsar('Marcar como leído');
    await pulsar('Volver');
    await pulsar('Pausar');
    await pulsar('Retomar');

    // Ni se pierde el sitio ni se penaliza la pausa.
    expect(await screen.findByText(/Día 2 de 7 · En curso/)).toBeTruthy();
    expect(await screen.findByText('1 día leído')).toBeTruthy();
  });

  it('un plan pausado no ofrece pausarlo otra vez', async () => {
    montar();
    await pulsar('Empezar este plan');
    await pulsar('Pausar');

    await waitFor(() => {
      expect(screen.queryByText('Pausar')).toBeNull();
    });
  });
});
