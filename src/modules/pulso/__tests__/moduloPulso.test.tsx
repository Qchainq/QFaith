// Pulso Espiritual, con el almacén, el motor y el cifrado reales.
//
// Lo que se comprueba con más cuidado es lo que **no** hace: no cuenta días,
// no puntúa, no dice que un estado sea peor que otro, y no deja que el
// servidor sepa por qué alguien se siente como se siente.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

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
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { renderizar } from '@shared/testing/renderizar';

import { acompanamientoDe, ESTADOS_PULSO, fechaDeHoy } from '../models/pulso';
import { PulsoContenedor } from '../screens/PulsoContenedor';

const USUARIO = 'usuario-1';
const HOY = '2026-08-03';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

let servidor: ServidorEnMemoria;
let sincronizacion: Sincronizacion;

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });

  const almacen = crearAlmacenEnMemoria();
  servidor = crearServidorEnMemoria();
  sincronizacion = {
    almacen,
    usuarioId: USUARIO,
    motor: crearMotorSincronizacion({
      almacen,
      remoto: servidor,
      usuarioId: USUARIO,
      dispositivoId: 'dispositivo-1',
    }),
  };
});

const montar = () =>
  renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <PulsoContenedor hoy={HOY} />
    </ProveedorSincronizacion>,
  );

describe('la pregunta', () => {
  it('dice que se puede saltar antes de que nadie responda', async () => {
    montar();

    // Una pregunta diaria que uno siente que debe contestar deja de ser una
    // pregunta.
    expect(await screen.findByText('¿Cómo está tu corazón hoy?')).toBeTruthy();
    expect(screen.getByText('Puedes saltarlo. No pasa nada.')).toBeTruthy();
  });

  it('ofrece los nueve estados del Documento 6', async () => {
    montar();
    await screen.findByText('¿Cómo está tu corazón hoy?');

    for (const etiqueta of [
      'En paz',
      'Agradecido',
      'Ansioso',
      'Triste',
      'Cansado',
      'Tentado',
      'Confundido',
      'Necesito dirección',
      'Alejado de Dios',
    ]) {
      expect(screen.getByRole('button', { name: etiqueta })).toBeTruthy();
    }
  });

  it('no se puede guardar sin elegir: la respuesta es de la persona', async () => {
    montar();
    const guardar = await screen.findByRole('button', { name: 'Guardar' });

    expect(guardar.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('responder', () => {
  it('guarda y muestra el acompañamiento de ese estado', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Cansado' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Hoy dijiste que estás así:')).toBeTruthy();
    expect(screen.getByText('Mateo 11:28')).toBeTruthy();
    expect(screen.getByText(/El cansancio no se resuelve con más esfuerzo/)).toBeTruthy();
  });

  it('responder otra vez corrige, no acumula', async () => {
    // Sin esto, dos respuestas del mismo día dejarían dos filas y ninguna
    // sabría cuál vale.
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Triste' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Hoy dijiste que estás así:');

    fireEvent.press(screen.getByRole('button', { name: 'Cambiar mi respuesta' }));
    fireEvent.press(await screen.findByRole('button', { name: 'En paz' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(async () =>
      expect(await sincronizacion.almacen.listar('spiritual_pulses')).toHaveLength(1),
    );
    expect(await screen.findByText('En paz')).toBeTruthy();
  });

  it('en un momento difícil sugiere hablar con alguien, sin alarma', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Alejado de Dios' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText(/Hablar con alguien de confianza ayuda/)).toBeTruthy();
  });

  it('en un momento tranquilo no aparece esa sugerencia', async () => {
    // Ofrecerla siempre la convertiría en ruido y dejaría de leerse.
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Agradecido' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Hoy dijiste que estás así:');

    expect(screen.queryByText(/Hablar con alguien de confianza ayuda/)).toBeNull();
  });
});

describe('lo que ve el servidor', () => {
  it('el estado sí, el porqué no', async () => {
    montar();

    fireEvent.press(await screen.findByRole('button', { name: 'Ansioso' }));
    fireEvent.changeText(
      screen.getByLabelText('¿Quieres contar por qué? (opcional)'),
      'Mañana dan los resultados de mi madre.',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Hoy dijiste que estás así:');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    // El código va en claro: lo necesita el servidor para preparar la lectura
    // y la oración sin descargar la vida entera de alguien.
    expect(crudo).toContain('ansioso');
    // Lo que de verdad cuenta algo, no.
    expect(crudo).not.toContain('madre');
    expect(crudo).not.toContain('resultados');
  });

  it('no se guarda nada que permita contar rachas', async () => {
    montar();
    fireEvent.press(await screen.findByRole('button', { name: 'Triste' }));
    fireEvent.press(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Hoy dijiste que estás así:');

    await sincronizacion.motor.sincronizar();

    // Contar cuántos días seguidos lleva alguien «triste» convertiría un
    // acompañamiento en una vigilancia.
    const crudo = JSON.stringify(servidor.filas()).toLowerCase();
    expect(crudo).not.toContain('streak');
    expect(crudo).not.toContain('racha');
    expect(crudo).not.toContain('consecutiv');
  });
});

describe('el modelo', () => {
  it('todos los estados tienen acompañamiento completo', () => {
    // Un estado sin lectura o sin oración dejaría la pantalla a medias justo
    // el día en que alguien lo elige.
    for (const estado of ESTADOS_PULSO) {
      const acompanamiento = acompanamientoDe(estado);
      expect(acompanamiento.claveLectura).toContain(estado);
      expect(acompanamiento.claveReflexion).toContain(estado);
      expect(acompanamiento.claveOracion).toContain(estado);
      expect(acompanamiento.claveAccion).toContain(estado);
    }
  });

  it('la fecha de hoy sale en el formato que espera el esquema', () => {
    expect(fechaDeHoy(new Date(2026, 7, 3))).toBe('2026-08-03');
    expect(fechaDeHoy(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});
