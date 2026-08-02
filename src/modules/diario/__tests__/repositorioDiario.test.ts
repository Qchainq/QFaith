// El repositorio es la frontera entre el texto que ve la persona y el sobre
// que es lo único que sale del dispositivo. Se prueba con el núcleo
// criptográfico y el motor de verdad: un doble aquí no demostraría nada,
// porque lo que importa es justo que el cifrado ocurra.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import type { AlmacenLocal } from '@shared/database/tipos';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido } from '@shared/services/crypto/tipos';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { crearRepositorioDiario, TIPO_ENTIDAD } from '../repositories/repositorioDiario';

const USUARIO = 'usuario-1';

function montar(clavePropia?: ClaveContenido) {
  const almacen: AlmacenLocal = crearAlmacenEnMemoria();
  const servidor = crearServidorEnMemoria();
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: servidor,
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });

  const claveMaestra = generarClaveMaestra();
  const derivadas = derivarClaves(claveMaestra);
  const clave = clavePropia ?? crearClaveContenido('diario');

  const repositorio = crearRepositorioDiario({
    motor,
    almacen,
    usuarioId: USUARIO,
    claveDiario: () => clave,
    claveHash: () => derivadas.claveHash,
  });

  return { repositorio, almacen, motor, servidor, clave };
}

const BORRADOR = {
  titulo: 'Gratitud de hoy',
  cuerpo: 'Agradezco la paciencia de mi familia.',
  // Etiquetas deliberadamente distintas de cualquier metadato en claro: el
  // tipo `gratitude` contiene «gratitud» y una aserción de subcadena sobre
  // ella pasaría o fallaría por casualidad.
  etiquetas: ['agradecimiento-hondo', 'mi-familia'],
  tipo: 'gratitude' as const,
  fecha: '2026-08-02',
};

describe('guardar', () => {
  it('devuelve la entrada legible y la deja en local', async () => {
    const { repositorio, almacen } = montar();

    const guardada = await repositorio.guardar(BORRADOR);

    expect(guardada.titulo).toBe(BORRADOR.titulo);
    expect(guardada.etiquetas).toEqual(['agradecimiento-hondo', 'mi-familia']);
    expect(await almacen.obtener(TIPO_ENTIDAD, guardada.id)).not.toBeNull();
  });

  it('el texto no aparece en ninguna parte del registro guardado', async () => {
    const { repositorio, almacen } = montar();

    const guardada = await repositorio.guardar(BORRADOR);
    const registro = await almacen.obtener(TIPO_ENTIDAD, guardada.id);

    const crudo = JSON.stringify(registro);
    expect(crudo).not.toContain('paciencia');
    expect(crudo).not.toContain('Gratitud de hoy');
    // Las etiquetas también van dentro: dicen tanto como el texto.
    expect(crudo).not.toContain('agradecimiento-hondo');
    expect(crudo).not.toContain('mi-familia');
  });

  it('solo salen como metadatos los cuatro campos que el servidor puede leer', async () => {
    const { repositorio, almacen } = montar();

    const guardada = await repositorio.guardar(BORRADOR);
    const registro = await almacen.obtener(TIPO_ENTIDAD, guardada.id);

    expect(Object.keys(registro?.metadatos ?? {}).sort()).toEqual([
      'entry_date',
      'entry_type',
      'is_ark_protected',
      'is_favorite',
    ]);
  });

  it('el servidor tampoco ve el texto tras sincronizar', async () => {
    const { repositorio, motor, servidor } = montar();
    await repositorio.guardar(BORRADOR);

    await motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(servidor.filas()).toHaveLength(1);
    expect(crudo).not.toContain('paciencia');
    expect(crudo).not.toContain('agradecimiento-hondo');
    // El tipo sí viaja en claro, y debe: es lo que permite filtrar sin
    // descifrar. Comprobarlo evita confundir un metadato con una fuga.
    expect(crudo).toContain('gratitude');
  });

  it('editar conserva el identificador y actualiza el contenido', async () => {
    const { repositorio } = montar();
    const original = await repositorio.guardar(BORRADOR);

    const editada = await repositorio.guardar({
      ...BORRADOR,
      id: original.id,
      cuerpo: 'Texto corregido.',
    });

    expect(editada.id).toBe(original.id);
    expect(editada.cuerpo).toBe('Texto corregido.');
    expect((await repositorio.listar()).entradas).toHaveLength(1);
  });
});

describe('listar', () => {
  it('ordena de más reciente a más antigua por la fecha del diario', async () => {
    const { repositorio } = montar();
    await repositorio.guardar({ ...BORRADOR, fecha: '2026-07-01', titulo: 'Antigua' });
    await repositorio.guardar({ ...BORRADOR, fecha: '2026-08-02', titulo: 'Reciente' });

    const { entradas } = await repositorio.listar();

    expect(entradas.map((entrada) => entrada.titulo)).toEqual(['Reciente', 'Antigua']);
  });

  it('cuenta las entradas que este dispositivo no puede abrir en vez de esconderlas', async () => {
    // Una clave rotada o un registro dañado dejan entradas ilegibles. Que
    // desaparezcan en silencio es peor que avisar de que están ahí.
    const { repositorio, almacen, motor } = montar();
    await repositorio.guardar(BORRADOR);

    const otro = crearRepositorioDiario({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveDiario: () => crearClaveContenido('diario'),
      claveHash: () => derivarClaves(generarClaveMaestra()).claveHash,
    });

    const lectura = await otro.listar();

    expect(lectura.entradas).toHaveLength(0);
    expect(lectura.ilegibles).toBe(1);
  });

  it('no devuelve las entradas eliminadas', async () => {
    const { repositorio } = montar();
    const entrada = await repositorio.guardar(BORRADOR);

    await repositorio.eliminar(entrada.id);

    expect((await repositorio.listar()).entradas).toHaveLength(0);
  });
});

describe('vínculo criptográfico', () => {
  it('un sobre movido a otra entrada no se puede abrir', async () => {
    // El identificador forma parte de los datos autenticados: sin esto,
    // alguien con acceso a la base podría reordenar el diario de otro.
    const { repositorio, almacen, clave } = montar();
    const primera = await repositorio.guardar(BORRADOR);
    const segunda = await repositorio.guardar({ ...BORRADOR, titulo: 'Otra' });

    const registroPrimera = await almacen.obtener(TIPO_ENTIDAD, primera.id);
    const registroSegunda = await almacen.obtener(TIPO_ENTIDAD, segunda.id);
    if (registroPrimera === null || registroSegunda === null) throw new Error('sin registro');

    // Se planta el sobre de la primera en la fila de la segunda.
    await almacen.guardar({ ...registroSegunda, sobre: registroPrimera.sobre });

    const lectura = await repositorio.listar();
    expect(lectura.ilegibles).toBe(1);
    expect(clave.dominio).toBe('diario');
  });
});

describe('borrado', () => {
  it('es lógico: el registro sigue existiendo con su fecha de baja', async () => {
    const { repositorio, almacen } = montar();
    const entrada = await repositorio.guardar(BORRADOR);

    await repositorio.eliminar(entrada.id);

    const registro = await almacen.obtener(TIPO_ENTIDAD, entrada.id);
    expect(registro).not.toBeNull();
    expect(registro?.eliminadoEn).not.toBeNull();
  });
});
