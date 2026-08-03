// Lo que decide el caso de uso: el orden en que se guardan las cosas.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import type { ServicioIa } from '@shared/services/ia/servicioIa';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { crearRepositorioIa } from '../repositories/repositorioIa';
import { enviarMensaje, listarConversaciones } from '../use-cases/conversar';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('ia');

  return crearRepositorioIa({
    almacen,
    usuarioId: USUARIO,
    motor: crearMotorSincronizacion({
      almacen,
      remoto: crearServidorEnMemoria(),
      usuarioId: USUARIO,
      dispositivoId: 'dispositivo-1',
    }),
    claveIa: () => clave,
    claveHash: () => derivadas.claveHash,
  });
}

const TEXTOS = { textoRespaldo: 'respaldo', textoSinAutorizacion: 'falta permiso' };

const servicioQueResponde = (texto: string): ServicioIa => ({
  responder: async () => ({ texto, origen: 'proveedor', categoriaSeguridad: null }),
});

describe('enviar un mensaje', () => {
  it('un mensaje en blanco no abre conversación ni gasta una llamada', async () => {
    const repositorio = montar();

    await expect(
      enviarMensaje({
        repositorio,
        servicio: servicioQueResponde('hola'),
        conversacionId: null,
        texto: '   \n  ',
        ...TEXTOS,
      }),
    ).rejects.toThrow();

    // Lo importante no es la excepción: es que no quedó una conversación
    // vacía y sin título en la lista de alguien.
    expect(await listarConversaciones(repositorio)).toHaveLength(0);
  });

  it('la pregunta sobrevive aunque el servicio se caiga después', async () => {
    const repositorio = montar();
    const servicio: ServicioIa = {
      responder: async () => {
        throw new Error('el servicio falló entero');
      },
    };

    const resultado = await enviarMensaje({
      repositorio,
      servicio,
      conversacionId: null,
      texto: 'Llevo semanas sin poder rezar.',
      ...TEXTOS,
    });

    const mensajes = await repositorio.mensajesDe(resultado.conversacionId);
    expect(mensajes.map((mensaje) => mensaje.texto)).toEqual([
      'Llevo semanas sin poder rezar.',
      'respaldo',
    ]);
  });

  it('el título de una conversación nueva sale del primer mensaje', async () => {
    const repositorio = montar();

    await enviarMensaje({
      repositorio,
      servicio: servicioQueResponde('claro'),
      conversacionId: null,
      texto: '  ¿Cómo   se perdona de verdad?  ',
      ...TEXTOS,
    });

    const [conversacion] = await listarConversaciones(repositorio);
    expect(conversacion?.titulo).toBe('¿Cómo se perdona de verdad?');
  });

  it('un segundo mensaje continúa la misma conversación, no abre otra', async () => {
    const repositorio = montar();
    const servicio = servicioQueResponde('claro');

    const primero = await enviarMensaje({
      repositorio,
      servicio,
      conversacionId: null,
      texto: 'Primera pregunta',
      ...TEXTOS,
    });
    await enviarMensaje({
      repositorio,
      servicio,
      conversacionId: primero.conversacionId,
      texto: 'Segunda pregunta',
      ...TEXTOS,
    });

    expect(await listarConversaciones(repositorio)).toHaveLength(1);
    expect(await repositorio.mensajesDe(primero.conversacionId)).toHaveLength(4);
  });
});
