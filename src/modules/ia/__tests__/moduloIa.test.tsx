// Recorrido del módulo de IA con el almacén, el motor y el cifrado reales.
//
// La batería de evaluación comprueba que el servicio no deja pasar lo que no
// debe. Esta prueba comprueba lo otro: que **lo que se guarda y lo que sube**
// cumple lo prometido. Un filtro perfecto no sirve de nada si la conversación
// acaba legible en el servidor.
import { fireEvent, screen } from '@testing-library/react-native';

import {
  ProveedorSincronizacion,
  type Sincronizacion,
} from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import type { ProveedorIa } from '@shared/services/ia/tipos';
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

import { IaContenedor } from '../screens/IaContenedor';

const USUARIO = 'usuario-1';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

let servidor: ServidorEnMemoria;
let sincronizacion: Sincronizacion;
/** Lo que el proveedor llegó a ver. Es la mitad de lo que se comprueba aquí. */
let recibido: unknown[] = [];

const proveedorFalso = (respuesta = 'El Salmo 23 habla de eso.'): ProveedorIa => ({
  responder: async (peticion) => {
    recibido.push(peticion);
    return { texto: respuesta };
  },
});

beforeEach(async () => {
  recibido = [];
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

function montar(proveedor: ProveedorIa = proveedorFalso()) {
  return renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      <IaContenedor proveedor={proveedor} />
    </ProveedorSincronizacion>,
  );
}

async function escribir(texto: string) {
  fireEvent.changeText(await screen.findByLabelText('¿De qué quieres hablar?'), texto);
  fireEvent.press(screen.getByRole('button', { name: 'Enviar' }));
}

async function autorizar() {
  fireEvent.press(await screen.findByRole('button', { name: 'Permitir enviar esta conversación' }));
}

describe('conversar', () => {
  it('guarda la pregunta y la respuesta, en ese orden', async () => {
    montar();
    await autorizar();
    await escribir('¿Qué dice la Biblia sobre el descanso?');

    expect(await screen.findByText('¿Qué dice la Biblia sobre el descanso?')).toBeTruthy();
    expect(await screen.findByText('El Salmo 23 habla de eso.')).toBeTruthy();
  });

  it('sin autorización no se envía nada al proveedor, y la pregunta no se pierde', async () => {
    montar();
    await escribir('¿Cómo oro por mi hermano?');

    // Lo que la persona escribió sigue ahí, guardado en su dispositivo.
    expect(await screen.findByText('¿Cómo oro por mi hermano?')).toBeTruthy();
    expect(recibido).toHaveLength(0);
    // Y se le dice que falta un permiso, no que su pregunta esté mal.
    expect(await screen.findByText(/permiso para enviar/)).toBeTruthy();
  });

  it('al proveedor solo le llega la conversación actual', async () => {
    montar();
    await autorizar();
    await escribir('Estoy cansado últimamente.');
    await screen.findByText('El Salmo 23 habla de eso.');

    const enviado = JSON.stringify(recibido);
    expect(enviado).toContain('Estoy cansado últimamente.');
    // Un solo mensaje de usuario: no se le adjunta el historial de nadie ni
    // contenido de otros módulos.
    expect(enviado.match(/"rol":"usuario"/g)).toHaveLength(1);
  });
});

describe('historial', () => {
  it('se puede volver a una conversación anterior', async () => {
    montar();
    await autorizar();
    await escribir('Hablemos del bautismo.');
    await screen.findByText('El Salmo 23 habla de eso.');

    // Volver a la portada del módulo: la conversación queda en el historial.
    fireEvent.press(screen.getByRole('button', { name: 'Nueva conversación' }));
    expect(await screen.findByText(/Escribe lo que quieras/)).toBeTruthy();

    fireEvent.press(await screen.findByRole('button', { name: 'Hablemos del bautismo.' }));

    expect(await screen.findByText('Hablemos del bautismo.')).toBeTruthy();
    expect(await screen.findByText('El Salmo 23 habla de eso.')).toBeTruthy();
  });
});

describe('Modo Crisis', () => {
  it('responde en local y no llama al proveedor', async () => {
    montar();
    await autorizar();
    await escribir('ya no quiero seguir viviendo');

    expect(await screen.findByText(/servicio de emergencias/)).toBeTruthy();
    // El mensaje no salió del dispositivo para ser clasificado por nadie.
    expect(recibido).toHaveLength(0);
  });

  it('funciona sin autorización y sin proveedor disponible', async () => {
    montar({
      responder: async () => {
        throw new Error('sin red');
      },
    });
    await escribir('quiero hacerme daño');

    expect(await screen.findByText(/servicio de emergencias/)).toBeTruthy();
    expect(
      await screen.findByText('Esto necesita a una persona, no a una aplicación.'),
    ).toBeTruthy();
  });

  it('no afirma que haya nadie vigilando la conversación', async () => {
    montar();
    await escribir('no aguanto más, quiero morirme');

    // El Documento 6 lo prohíbe salvo que exista un servicio humano real.
    const texto = await screen.findByText(/servicio de emergencias/);
    expect(String(texto.props.children)).toContain('aquí no hay nadie leyendo');
  });
});

describe('lo que ve el servidor', () => {
  it('nada de la conversación viaja legible', async () => {
    montar();
    await autorizar();
    await escribir('Tengo miedo de contarle a mi mujer lo que hice.');
    await screen.findByText('El Salmo 23 habla de eso.');

    await sincronizacion.motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('miedo');
    expect(crudo).not.toContain('mujer');
    expect(crudo).not.toContain('Salmo');
    // Sí ve que existen filas de estos tipos: eso es todo lo que necesita.
    expect(crudo).toContain('ai_messages');
  });
});

describe('borrar la memoria', () => {
  it('borra conversaciones y mensajes, y se nota en la pantalla', async () => {
    montar();
    await autorizar();
    await escribir('Hablemos de perdón.');
    await screen.findByText('El Salmo 23 habla de eso.');

    fireEvent.press(screen.getByRole('button', { name: 'Borrar toda la memoria' }));
    // Se pide confirmación antes: borrar la memoria no puede ser un toque
    // accidental.
    await screen.findByText('¿Borrar todas las conversaciones? No se puede deshacer.');
    fireEvent.press(screen.getAllByRole('button', { name: 'Borrar toda la memoria' })[0]!);

    expect(await screen.findByText(/Escribe lo que quieras/)).toBeTruthy();
    expect(screen.queryByText('Hablemos de perdón.')).toBeNull();

    // Y de verdad: en el almacén no queda ni un mensaje ni una conversación
    // en pie. Borrar solo la cabecera sería una promesa incumplida.
    expect(await sincronizacion.almacen.listar('ai_messages')).toHaveLength(0);
    expect(await sincronizacion.almacen.listar('ai_conversations')).toHaveLength(0);
  });
});
