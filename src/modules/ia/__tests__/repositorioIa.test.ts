// Frontera entre el texto y el sobre, con el cifrado y el motor de verdad.
//
// Lo propio de este módulo: un registro que no se puede descifrar **se salta
// sin llevarse la conversación por delante**, y el borrado de memoria alcanza
// mensajes y conversaciones por igual.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { tituloDesde } from '../models/conversacion';
import { crearRepositorioIa, TIPO_CONVERSACION, TIPO_MENSAJE } from '../repositories/repositorioIa';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: crearServidorEnMemoria(),
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('ia');

  return {
    almacen,
    motor,
    repositorio: crearRepositorioIa({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveIa: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

describe('conversaciones', () => {
  it('se leen de vuelta con su título y su tipo', async () => {
    const { repositorio } = montar();

    await repositorio.crearConversacion({ titulo: 'Sobre el perdón', tipo: 'biblia' });

    const [conversacion] = await repositorio.conversaciones();
    expect(conversacion?.titulo).toBe('Sobre el perdón');
    expect(conversacion?.tipo).toBe('biblia');
  });

  it('un tipo que no existe no rompe la lista: se lee como general', async () => {
    const { almacen, repositorio } = montar();
    const creada = await repositorio.crearConversacion({ titulo: 'Sin tipo' });

    // Simula una versión futura con un tipo que este cliente no conoce.
    const registro = await almacen.obtener(TIPO_CONVERSACION, creada.id);
    await almacen.guardar({ ...registro!, metadatos: { conversation_type: 'inventado' } });

    const [conversacion] = await repositorio.conversaciones();
    expect(conversacion?.tipo).toBe('general');
  });

  it('las más recientes van primero', async () => {
    const { repositorio } = montar();

    await repositorio.crearConversacion({ titulo: 'Primera' });
    await new Promise((seguir) => setTimeout(seguir, 2));
    await repositorio.crearConversacion({ titulo: 'Segunda' });

    const titulos = (await repositorio.conversaciones()).map((c) => c.titulo);
    expect(titulos[0]).toBe('Segunda');
  });

  it('un registro ilegible se salta, y el resto sigue leyéndose', async () => {
    const { almacen, repositorio } = montar();
    const rota = await repositorio.crearConversacion({ titulo: 'Se va a corromper' });
    await repositorio.crearConversacion({ titulo: 'Esta está bien' });

    const registro = await almacen.obtener(TIPO_CONVERSACION, rota.id);
    await almacen.guardar({
      ...registro!,
      sobre: { ...registro!.sobre, encryptedPayload: 'ZGF0b3MtcXVlLW5vLWFicmVu' },
    });

    // Perder una conversación no puede llevarse las demás por delante.
    const titulos = (await repositorio.conversaciones()).map((c) => c.titulo);
    expect(titulos).toEqual(['Esta está bien']);
  });
});

describe('mensajes', () => {
  it('solo devuelve los de su conversación, en orden de escritura', async () => {
    const { repositorio } = montar();
    const una = await repositorio.crearConversacion({ titulo: 'Una' });
    const otra = await repositorio.crearConversacion({ titulo: 'Otra' });

    await repositorio.anotarMensaje({ conversacionId: una.id, rol: 'usuario', texto: 'Primero' });
    await new Promise((seguir) => setTimeout(seguir, 2));
    await repositorio.anotarMensaje({
      conversacionId: una.id,
      rol: 'asistente',
      texto: 'Segundo',
    });
    await repositorio.anotarMensaje({ conversacionId: otra.id, rol: 'usuario', texto: 'Ajeno' });

    const textos = (await repositorio.mensajesDe(una.id)).map((m) => m.texto);
    expect(textos).toEqual(['Primero', 'Segundo']);
  });

  it('la marca de crisis se conserva, y nada más de la crisis se guarda', async () => {
    const { almacen, repositorio } = montar();
    const conversacion = await repositorio.crearConversacion({ titulo: 'Difícil' });

    const mensaje = await repositorio.anotarMensaje({
      conversacionId: conversacion.id,
      rol: 'asistente',
      texto: 'Busca ayuda ahora mismo.',
      categoriaSeguridad: 'crisis',
    });

    expect(mensaje.categoriaSeguridad).toBe('crisis');

    // Fuera del sobre solo está el hecho. Ni el indicador que lo activó ni una
    // sola palabra de lo que se dijo.
    const registro = await almacen.obtener(TIPO_MENSAJE, mensaje.id);
    expect(registro?.metadatos.safety_category).toBe('crisis');
    expect(JSON.stringify(registro?.metadatos)).not.toContain('ayuda');
  });

  it('sin marca de crisis el campo queda vacío, no ausente', async () => {
    const { repositorio } = montar();
    const conversacion = await repositorio.crearConversacion({ titulo: 'Normal' });

    const mensaje = await repositorio.anotarMensaje({
      conversacionId: conversacion.id,
      rol: 'usuario',
      texto: 'Hola',
    });

    expect(mensaje.categoriaSeguridad).toBeNull();
  });
});

describe('borrar la memoria', () => {
  it('retira mensajes y conversaciones, y dice cuántos', async () => {
    const { repositorio } = montar();
    const conversacion = await repositorio.crearConversacion({ titulo: 'Una' });
    await repositorio.anotarMensaje({
      conversacionId: conversacion.id,
      rol: 'usuario',
      texto: 'Algo',
    });

    expect(await repositorio.borrarMemoria()).toEqual({ borrados: 2 });
    expect(await repositorio.conversaciones()).toHaveLength(0);
    expect(await repositorio.mensajesDe(conversacion.id)).toHaveLength(0);
  });
});

describe('título deducido', () => {
  it('recorta los largos y deja los cortos como están', () => {
    expect(tituloDesde('  ¿Cómo   perdono?  ')).toBe('¿Cómo perdono?');

    const largo = tituloDesde('a'.repeat(200));
    expect(largo).toHaveLength(60);
    expect(largo.endsWith('…')).toBe(true);
  });
});
