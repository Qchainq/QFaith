// Frontera entre el texto y el sobre, con el cifrado y el motor de verdad.
//
// Lo propio de este módulo: la cronología ordena por el día del recuerdo, no
// por el día en que se escribió, y el memorial sobrevive a la petición de la
// que nació.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';

import { crearRepositorioMemorial, TIPO_MEMORIAL } from '../repositories/repositorioMemorial';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const servidor: ServidorEnMemoria = crearServidorEnMemoria();

  // Reloj controlado. Sin él, dos escrituras seguidas comparten milisegundo y
  // «ordena por la fecha del recuerdo» pasaría igual ordenando por la fecha
  // de escritura: la prueba no distinguiría una cosa de la otra.
  let tic = 0;
  const ahora = (): string => new Date(Date.UTC(2026, 0, 1) + tic++ * 1000).toISOString();

  const motor = crearMotorSincronizacion({
    almacen,
    remoto: servidor,
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
    ahora,
  });
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('memorial');

  return {
    almacen,
    servidor,
    motor,
    repositorio: crearRepositorioMemorial({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveMemorial: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

const BORRADOR = {
  titulo: 'Volvió a hablarme mi padre',
  relato: 'Después de cuatro años me llamó él. Estuvimos una hora al teléfono.',
  personas: ['Papá'],
  ocurrioEl: '2026-03-14',
};

describe('guardar y releer', () => {
  it('el texto vuelve entero después de pasar por el sobre', async () => {
    const { repositorio } = montar();

    const guardado = await repositorio.guardar(BORRADOR);

    expect(guardado.titulo).toBe(BORRADOR.titulo);
    expect(guardado.relato).toBe(BORRADOR.relato);
    expect(guardado.personas).toEqual(['Papá']);
    expect(guardado.ocurrioEl).toBe('2026-03-14');
    expect(guardado.favorito).toBe(false);
  });

  it('el servidor no ve el relato ni el nombre de nadie', async () => {
    const { repositorio, motor, servidor } = montar();
    await repositorio.guardar(BORRADOR);

    await motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('padre');
    expect(crudo).not.toContain('Papá');
    expect(crudo).not.toContain('teléfono');
    // Sí ve la fecha del recuerdo: la necesita para ordenar sin descifrar.
    expect(crudo).toContain('2026-03-14');
  });

  it('editar el texto no pierde la petición de origen', async () => {
    const { repositorio } = montar();
    const creado = await repositorio.guardar({ ...BORRADOR, peticionId: 'peticion-7' });

    const editado = await repositorio.guardar({
      id: creado.id,
      titulo: 'Otro título',
      relato: 'Otro relato',
      personas: [],
    });

    // Es lo que ata la respuesta a lo que se pidió.
    expect(editado.peticionId).toBe('peticion-7');
    expect(editado.ocurrioEl).toBe('2026-03-14');
  });

  it('un registro ilegible se cuenta, no se pierde en silencio', async () => {
    const { almacen, repositorio } = montar();
    const roto = await repositorio.guardar(BORRADOR);
    await repositorio.guardar({ ...BORRADOR, titulo: 'Este sí se lee' });

    const registro = await almacen.obtener(TIPO_MEMORIAL, roto.id);
    await almacen.guardar({
      ...registro!,
      sobre: { ...registro!.sobre, encryptedPayload: 'ZGF0b3MtcXVlLW5vLWFicmVu' },
    });

    const { memoriales, ilegibles } = await repositorio.listar();
    expect(memoriales).toHaveLength(1);
    // Contarlos permite avisar a la persona en lugar de fingir que no existen.
    expect(ilegibles).toBe(1);
  });
});

describe('cronología', () => {
  it('ordena por el día del recuerdo, no por el día en que se escribió', async () => {
    const { repositorio } = montar();

    // El orden de escritura contradice al del recuerdo a propósito: se anota
    // primero el más reciente. Ordenar por fecha de escritura descendente
    // daría el orden inverso al correcto.
    await repositorio.guardar({ ...BORRADOR, titulo: 'Reciente', ocurrioEl: '2026-05-05' });
    await repositorio.guardar({ ...BORRADOR, titulo: 'Antiguo', ocurrioEl: '2020-01-01' });

    const { memoriales } = await repositorio.listar();
    expect(memoriales.map((memorial) => memorial.titulo)).toEqual(['Reciente', 'Antiguo']);
  });

  it('los que no tienen fecha van al final, sin inventarles un día', async () => {
    const { repositorio } = montar();
    // Se anota antes el que sí tiene fecha, y encima es muy antigua: si el
    // orden se decidiera por la escritura, el «sin fecha» iría delante.
    await repositorio.guardar({ ...BORRADOR, titulo: 'Con fecha', ocurrioEl: '2019-01-01' });
    await repositorio.guardar({ ...BORRADOR, titulo: 'Sin fecha', ocurrioEl: null });

    const { memoriales } = await repositorio.listar();
    expect(memoriales.map((memorial) => memorial.titulo)).toEqual(['Con fecha', 'Sin fecha']);
    expect(memoriales[1]?.ocurrioEl).toBeNull();
  });
});

describe('favoritos', () => {
  it('marcar y desmarcar no toca el texto ni vuelve a cifrarlo', async () => {
    const { almacen, repositorio } = montar();
    const creado = await repositorio.guardar(BORRADOR);
    const sobreOriginal = (await almacen.obtener(TIPO_MEMORIAL, creado.id))?.sobre;

    const marcado = await repositorio.alternarFavorito(creado.id);
    expect(marcado?.favorito).toBe(true);
    expect(marcado?.relato).toBe(BORRADOR.relato);
    // Mismo criptograma: no había nada nuevo que cifrar.
    expect((await almacen.obtener(TIPO_MEMORIAL, creado.id))?.sobre).toEqual(sobreOriginal);

    expect((await repositorio.alternarFavorito(creado.id))?.favorito).toBe(false);
  });

  it('alternar un memorial que no existe devuelve null en vez de romper', async () => {
    const { repositorio } = montar();
    expect(await repositorio.alternarFavorito('no-existe')).toBeNull();
  });
});

describe('eliminar', () => {
  it('es lógico: desaparece de la lista pero deja rastro para sincronizar', async () => {
    const { repositorio, motor, servidor } = montar();
    const creado = await repositorio.guardar(BORRADOR);

    await repositorio.eliminar(creado.id);
    await motor.sincronizar();

    expect((await repositorio.listar()).memoriales).toHaveLength(0);

    // El otro dispositivo tiene que enterarse de que se retiró: la fila sigue
    // ahí, marcada de baja. Un borrado físico dejaría al otro dispositivo
    // creyendo que el memorial nunca existió, y volvería a subirlo.
    const [fila] = servidor.filas();
    expect(fila?.id).toBe(creado.id);
    expect(fila?.eliminadoEn).not.toBeNull();
  });
});
