// El recorrido completo, montado: un hábito con recordatorio acaba siendo un
// aviso programado en el sistema.
//
// Las piezas se prueban por separado en sus archivos. Esto comprueba lo otro,
// que es lo que se rompe en silencio: que **están conectadas**. Un servicio
// impecable al que no llama nadie pasa todas sus pruebas y no programa nada,
// y eso es exactamente lo que pasaba antes de este archivo.
import { screen, waitFor } from '@testing-library/react-native';

import { crearRepositorioHabitos } from '@modules/habitos/repositories/repositorioHabitos';
import { crearSincronizacionDePrueba } from '@modules/sincronizacion/__tests__/sincronizacionDePrueba';
import { ProveedorSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import type { AlmacenLocal } from '@shared/database/tipos';
import {
  bloquear,
  claveDeDominio,
  clavesDerivadas,
  inicializarCuenta,
  olvidarDispositivo,
} from '@shared/services/keys/servicioClaves';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';
import type {
  AvisoProgramable,
  PuertoNotificaciones,
} from '@shared/services/notificaciones/puertoNotificaciones';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar } from '@shared/testing/renderizar';
import { Texto } from '@shared/components/Texto';

import { AvisosAlDia } from '../services/AvisosAlDia';
import { ProveedorNotificaciones } from '../services/contextoNotificaciones';

const USUARIO = 'usuario-1';

// Argon2id de verdad con parámetros mínimos: lo que importa aquí no es el
// coste del derivado sino que el hábito se cifre con **la misma clave** que
// después usará el hook para leerlo.
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

/** Lo que el perfil devuelve. Solo hace falta el interruptor. */
const mockAjustes = jest.fn();
jest.mock('@modules/perfil/hooks/usePerfil', () => ({
  useAjustes: () => mockAjustes(),
}));

jest.mock('@shared/services/supabase/rest', () => ({
  crearClienteRest: () => ({
    peticion: async () => ({ estado: 200, filas: [], codigo: null }),
    comoError: () => new Error('sin red'),
  }),
}));

function puertoDePrueba() {
  const programados = new Map<string, AvisoProgramable>();
  const puerto: PuertoNotificaciones = {
    permisoActual: async () => 'concedido',
    pedirPermiso: async () => 'concedido',
    programar: async (aviso) => {
      programados.set(aviso.id, aviso);
    },
    cancelar: async (id) => {
      programados.delete(id);
    },
    programados: async () => [...programados.keys()],
    cancelarTodos: async () => programados.clear(),
    tokenPush: async () => null,
  };
  return { puerto, programados };
}

async function montar(parametros: {
  readonly notificacionesActivas: boolean;
  readonly puerto: PuertoNotificaciones;
  readonly almacen: AlmacenLocal;
}) {
  mockAjustes.mockReturnValue({ data: { notificaciones: parametros.notificacionesActivas } });

  const sincronizacion = crearSincronizacionDePrueba({
    almacen: parametros.almacen,
    usuarioId: USUARIO,
    remoto: crearServidorEnMemoria(),
  });

  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
      sincronizarEnSegundoPlano={false}
    >
      <ProveedorNotificaciones traducir={(clave) => clave} puerto={parametros.puerto}>
        <AvisosAlDia />
        <Texto nivel="texto">montado</Texto>
      </ProveedorNotificaciones>
    </ProveedorSincronizacion>,
  );
}

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });
  useEstadoSesion
    .getState()
    .abrirSesion({ id: USUARIO, correo: 'ana@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(() => {
  useEstadoSesion.getState().cerrarSesion();
});

/** Guarda un hábito de verdad, pasando por su repositorio. */
async function crearHabito(parametros: {
  readonly almacen: AlmacenLocal;
  readonly titulo: string;
  readonly hora: string | null;
}): Promise<void> {
  const motor = crearMotorSincronizacion({
    almacen: parametros.almacen,
    remoto: crearServidorEnMemoria(),
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });
  const repositorio = crearRepositorioHabitos({
    motor,
    almacen: parametros.almacen,
    usuarioId: USUARIO,
    claveHabito: () => claveDeDominio('habito'),
    claveHash: () => clavesDerivadas().claveHash,
  });

  await repositorio.guardar({
    titulo: parametros.titulo,
    descripcion: '',
    categoria: null,
    frecuencia: 'daily',
    configuracion: { dias: [] },
    fechaInicio: '2026-01-01',
    recordatorioActivo: parametros.hora !== null,
    horaRecordatorio: parametros.hora,
  });
}

describe('un hábito con recordatorio acaba programado', () => {
  it('con las notificaciones activas', async () => {
    const almacen = crearAlmacenEnMemoria();
    const { puerto, programados } = puertoDePrueba();
    await crearHabito({ almacen, titulo: 'Leer por la mañana', hora: '08:00' });

    await montar({ notificacionesActivas: true, puerto, almacen });
    await screen.findByText('montado');

    await waitFor(() => expect(programados.size).toBe(1));
  });

  it('y con el interruptor apagado no se programa nada', async () => {
    const almacen = crearAlmacenEnMemoria();
    const { puerto, programados } = puertoDePrueba();
    await crearHabito({ almacen, titulo: 'Leer por la mañana', hora: '08:00' });

    await montar({ notificacionesActivas: false, puerto, almacen });
    await screen.findByText('montado');

    // Se espera un poco para no confundir «no programa» con «todavía no ha
    // llegado»: sin esto la prueba pasaría aunque el efecto no hubiera corrido.
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(programados.size).toBe(0);
  });

  it('y el título del hábito no llega al sistema', async () => {
    // La comprobación que importa del recorrido entero: por muchas capas que
    // haya, lo que acaba en el sistema operativo no lleva lo que la persona
    // escribió.
    const almacen = crearAlmacenEnMemoria();
    const { puerto, programados } = puertoDePrueba();
    await crearHabito({ almacen, titulo: 'Dejar de beber', hora: '08:00' });

    await montar({ notificacionesActivas: true, puerto, almacen });
    await screen.findByText('montado');
    await waitFor(() => expect(programados.size).toBe(1));

    expect(JSON.stringify([...programados.values()])).not.toContain('beber');
  });
});
