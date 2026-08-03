// La mitad privada del módulo. Lo que se comprueba aquí es exactamente qué
// cae a cada lado de la frontera: el texto de la nota va cifrado, la
// referencia no, y eso es un compromiso consciente.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

import { crearRepositorioNotasBiblicas, TIPO_NOTA } from '../repositories/repositorioNotasBiblicas';

const USUARIO = 'usuario-1';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const servidor = crearServidorEnMemoria();
  const motor = crearMotorSincronizacion({
    almacen,
    remoto: servidor,
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });
  const derivadas = derivarClaves(generarClaveMaestra());
  const clave = crearClaveContenido('notaBiblica');

  return {
    almacen,
    servidor,
    motor,
    repositorio: crearRepositorioNotasBiblicas({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveNotas: () => clave,
      claveHash: () => derivadas.claveHash,
    }),
  };
}

const BORRADOR = {
  texto: 'Esto me recordó lo que pasó con mi hermano.',
  libro: 'JHN',
  capitulo: 3,
  versiculoInicio: 16,
  versiculoFin: 16,
};

describe('qué cae a cada lado de la frontera', () => {
  it('el texto de la nota no sale del sobre', async () => {
    const { repositorio, almacen } = montar();

    const nota = await repositorio.guardar(BORRADOR);
    const crudo = JSON.stringify(await almacen.obtener(TIPO_NOTA, nota.id));

    expect(crudo).not.toContain('mi hermano');
  });

  it('la referencia sí queda en claro, y es a propósito', async () => {
    // Permite mostrar la nota junto a su pasaje sin descargar y descifrar
    // todas las notas de la persona. Revela qué pasajes le interesan, no qué
    // piensa de ellos.
    const { repositorio, almacen } = montar();

    const nota = await repositorio.guardar(BORRADOR);
    const registro = await almacen.obtener(TIPO_NOTA, nota.id);

    expect(registro?.metadatos).toMatchObject({
      book_code: 'JHN',
      chapter_number: 3,
      verse_start: 16,
    });
  });

  it('el texto bíblico no se guarda con la nota', async () => {
    // El contenido bíblico no pertenece al usuario (Documento 12): no entra
    // en su contenido cifrado ni viaja con él.
    const { repositorio, almacen } = montar();

    const nota = await repositorio.guardar(BORRADOR);
    const registro = await almacen.obtener(TIPO_NOTA, nota.id);

    expect(Object.keys(registro?.metadatos ?? {}).sort()).toEqual([
      'book_code',
      'chapter_number',
      'translation_id',
      'verse_end',
      'verse_start',
    ]);
  });
});

describe('lectura por capítulo', () => {
  it('devuelve solo las notas del capítulo pedido', async () => {
    const { repositorio } = montar();
    await repositorio.guardar(BORRADOR);
    await repositorio.guardar({ ...BORRADOR, capitulo: 4, texto: 'Otra' });

    const notas = await repositorio.delCapitulo('JHN', 3);

    expect(notas).toHaveLength(1);
    expect(notas[0]?.texto).toBe(BORRADOR.texto);
  });

  it('no mezcla notas de libros distintos con el mismo capítulo', async () => {
    const { repositorio } = montar();
    await repositorio.guardar(BORRADOR);
    await repositorio.guardar({ ...BORRADOR, libro: 'MRK', texto: 'De Marcos' });

    expect(await repositorio.delCapitulo('MRK', 3)).toHaveLength(1);
  });

  it('cuenta las notas que este dispositivo no puede abrir', async () => {
    const { repositorio, almacen, motor } = montar();
    await repositorio.guardar(BORRADOR);

    const otro = crearRepositorioNotasBiblicas({
      motor,
      almacen,
      usuarioId: USUARIO,
      claveNotas: () => crearClaveContenido('notaBiblica'),
      claveHash: () => derivarClaves(generarClaveMaestra()).claveHash,
    });

    expect((await otro.listar()).ilegibles).toBe(1);
  });
});

describe('sincronización', () => {
  it('el servidor recibe la referencia pero no la nota', async () => {
    const { repositorio, motor, servidor } = montar();
    await repositorio.guardar(BORRADOR);

    await motor.sincronizar();

    const crudo = JSON.stringify(servidor.filas());
    expect(crudo).not.toContain('mi hermano');
    expect(crudo).toContain('JHN');
  });
});

describe('borrado', () => {
  it('es lógico, como en el resto del contenido privado', async () => {
    const { repositorio, almacen } = montar();
    const nota = await repositorio.guardar(BORRADOR);

    await repositorio.eliminar(nota.id);

    const registro = await almacen.obtener(TIPO_NOTA, nota.id);
    expect(registro?.eliminadoEn).not.toBeNull();
    expect((await repositorio.listar()).notas).toHaveLength(0);
  });
});
