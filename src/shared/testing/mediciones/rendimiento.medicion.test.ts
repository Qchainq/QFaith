// Medidas de rendimiento, contra los presupuestos del Documento 14.
//
// **No corre con `npm test`.** Se lanza aparte, con `npm run medir`, por dos
// razones: tarda, y sus números dependen de la máquina. Una suite normal que
// dependa del reloj de la máquina termina fallando en integración continua un
// martes cualquiera, y a la tercera vez alguien la desactiva. Entonces deja de
// medir nada.
//
// Lo que sí se comprueba aquí son las dos cosas que no dependen de la
// máquina:
//
//   1. **Cómo crece el coste con el volumen.** Que una operación sea lineal
//      es una propiedad del algoritmo y viaja al teléfono igual que al
//      servidor. Que sea cuadrática, también.
//   2. **Márgenes muy holgados** sobre los presupuestos, para detectar un
//      desastre —una operación que se vuelve mil veces más lenta— sin fallar
//      por el ruido de un contenedor compartido.
//
// El presupuesto de verdad se comprueba en un teléfono. Esto es lo que se
// puede saber antes de tenerlo delante.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { crearAlmacenSqlite } from '@shared/database/almacenSqlite';
import type { AlmacenLocal, Metadatos, RegistroLocal } from '@shared/database/tipos';
import { crearRepositorioMarcasBiblicas } from '@modules/biblia/repositories/repositorioMarcasBiblicas';
import { crearRepositorioDiario } from '@modules/diario/repositories/repositorioDiario';
import { exportarContenido } from '@modules/exportacion/use-cases/exportarContenido';
import {
  cifrar,
  cifrarBytes,
  crearClaveContenido,
  derivarClaves,
  descifrar,
  descifrarBytes,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import type { ClaveContenido, DominioCifrado } from '@shared/services/crypto/tipos';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';
import { crearEjecutorNodeSqlite } from '@shared/testing/ejecutorNodeSqlite';
import { factorDeCrecimiento, medir, tabla, type Medicion } from '@shared/testing/medicion';

const USUARIO = 'usuario-medicion';

// Datos inventados. Nunca contenido real de nadie (invariante 15).
const PARRAFO =
  'Hoy volví a leer el Salmo 121 y me quedé en aquello de que no dormita ' +
  'el que te guarda. Lo he leído muchas veces y hoy me hizo falta de otra ' +
  'manera. Anoté esto para acordarme cuando vuelva a costarme. ';

/** Un texto de `veces` párrafos, distinto en cada registro. */
const textoDe = (veces: number, semilla: number): string =>
  `${semilla}. ${PARRAFO.repeat(veces)}`;

const mediciones: Medicion[] = [];

/** Mide y guarda para la tabla final. */
async function anotar(
  nombre: string,
  ejecutar: (vuelta: number) => unknown | Promise<unknown>,
  opciones?: { readonly repeticiones?: number },
): Promise<Medicion> {
  const medicion = await medir(nombre, ejecutar, opciones);
  mediciones.push(medicion);
  return medicion;
}

const claves = (() => {
  const derivadas = derivarClaves(generarClaveMaestra());
  const porDominio = new Map<DominioCifrado, ClaveContenido>();
  const de = (dominio: DominioCifrado): ClaveContenido => {
    const existente = porDominio.get(dominio);
    if (existente !== undefined) return existente;
    const nueva = crearClaveContenido(dominio);
    porDominio.set(dominio, nueva);
    return nueva;
  };
  return { derivadas, de };
})();

/** Un registro local ya cifrado, como el que deja cualquier repositorio. */
function registro(parametros: {
  readonly tipo: string;
  readonly dominio: DominioCifrado;
  readonly indice: number;
  readonly parrafos?: number;
  readonly metadatos?: Metadatos;
}): RegistroLocal {
  const id = `${parametros.tipo}-${parametros.indice}`;
  const contenido = JSON.stringify({
    texto: textoDe(parametros.parrafos ?? 3, parametros.indice),
  });
  const sobre = cifrar({
    contenido,
    clave: claves.de(parametros.dominio),
    claveHash: claves.derivadas.claveHash,
    vinculo: { usuarioId: USUARIO, tipoEntidad: parametros.tipo, entidadId: id },
  });
  // Fechas separadas un minuto: el orden de listado tiene que ser real, no un
  // empate de milisegundos que haría la ordenación gratis.
  const instante = new Date(Date.UTC(2020, 0, 1) + parametros.indice * 60_000).toISOString();

  return {
    id,
    usuarioId: USUARIO,
    tipoEntidad: parametros.tipo,
    sobre,
    metadatos: parametros.metadatos ?? {},
    version: 1,
    revisionRemota: 1,
    estado: 'sincronizado',
    creadoEn: instante,
    actualizadoEn: instante,
    eliminadoEn: null,
    dispositivoId: 'dispositivo-medicion',
  };
}

async function llenar(
  almacen: AlmacenLocal,
  parametros: Omit<Parameters<typeof registro>[0], 'indice'> & { readonly cuantos: number },
): Promise<void> {
  for (let indice = 0; indice < parametros.cuantos; indice += 1) {
    await almacen.guardar(registro({ ...parametros, indice }));
  }
}

afterAll(() => {
  // La tabla es el entregable. Sin ella la suite comprobaría que nada se ha
  // desmadrado y no diría dónde está el coste, que es la mitad del trabajo.
  // eslint-disable-next-line no-console
  console.log(`\n${tabla(mediciones)}\n`);
});

// ── Criptografía ──────────────────────────────────────────────────────────
//
// Es lo que se paga en toda lectura de contenido privado, así que conviene
// saber cuánto cuesta una sola vez antes de mirar cuánto cuesta mil veces.

describe('cifrado de un registro', () => {
  const clave = claves.de('diario');
  const claveHash = claves.derivadas.claveHash;
  const vinculo = { usuarioId: USUARIO, tipoEntidad: 'journal_entries', entidadId: 'e-1' };

  it('cifrar y descifrar una entrada de diario corriente', async () => {
    const contenido = JSON.stringify({ texto: textoDe(3, 1) });
    const sobre = cifrar({ contenido, clave, claveHash, vinculo });

    const cifrado = await anotar('cifrar entrada (~700 B)', () =>
      cifrar({ contenido, clave, claveHash, vinculo }),
    );
    const descifrado = await anotar('descifrar entrada (~700 B)', () =>
      descifrar({ sobre, clave, vinculo }),
    );

    // Presupuesto: «apertura de contenido privado < 500 ms». Un solo registro
    // debe quedar tan lejos de eso que el margen absorba cualquier máquina.
    expect(descifrado.mediana).toBeLessThan(20);
    expect(cifrado.mediana).toBeLessThan(20);
  });

  it('el coste crece con el tamaño del texto, no más deprisa', async () => {
    const corto = JSON.stringify({ texto: textoDe(1, 1) });
    const largo = JSON.stringify({ texto: textoDe(100, 1) });
    const sobreCorto = cifrar({ contenido: corto, clave, claveHash, vinculo });
    const sobreLargo = cifrar({ contenido: largo, clave, claveHash, vinculo });

    const pequeno = await anotar('descifrar texto ~250 B', () =>
      descifrar({ sobre: sobreCorto, clave, vinculo }),
    );
    const grande = await anotar('descifrar texto ~25 kB', () =>
      descifrar({ sobre: sobreLargo, clave, vinculo }),
    );

    // Cien veces más texto no puede costar mil veces más. El margen es amplio
    // a propósito: en textos tan pequeños el coste fijo domina y la relación
    // no llega a ser proporcional.
    expect(factorDeCrecimiento(pequeno, grande)).toBeLessThan(200);
  });
});

describe('cifrado de archivos', () => {
  it('una fotografía y un audio largo', async () => {
    const claveMedios = claves.de('medios');
    const claveHash = claves.derivadas.claveHash;
    const vinculo = { usuarioId: USUARIO, tipoEntidad: 'private_media', entidadId: 'a-1' };

    const foto = new Uint8Array(3 * 1024 * 1024).fill(7);
    const audio = new Uint8Array(20 * 1024 * 1024).fill(9);

    const sobreFoto = cifrarBytes({ contenido: foto, clave: claveMedios, claveHash, vinculo });

    const cifradoFoto = await anotar(
      'cifrar archivo 3 MB',
      () => cifrarBytes({ contenido: foto, clave: claveMedios, claveHash, vinculo }),
      { repeticiones: 5 },
    );
    const cifradoAudio = await anotar(
      'cifrar archivo 20 MB',
      () => cifrarBytes({ contenido: audio, clave: claveMedios, claveHash, vinculo }),
      { repeticiones: 3 },
    );
    await anotar(
      'descifrar archivo 3 MB',
      () => descifrarBytes({ sobre: sobreFoto, clave: claveMedios, vinculo }),
      { repeticiones: 5 },
    );

    // Casi siete veces más bytes: el coste tiene que seguir al tamaño. Un
    // factor muy por encima significaría copias de más por el camino, y en un
    // teléfono eso no es solo lentitud, es memoria.
    expect(factorDeCrecimiento(cifradoFoto, cifradoAudio)).toBeLessThan(15);
  });
});

// ── Consultas locales ─────────────────────────────────────────────────────
//
// Presupuesto: **< 100 ms**. Es lo que se hace al abrir cualquier lista.

describe('consultas locales sobre SQLite', () => {
  it('listar 5000 registros del mismo tipo', async () => {
    const ejecutor = crearEjecutorNodeSqlite();
    const almacen = await crearAlmacenSqlite(ejecutor);
    await llenar(almacen, { tipo: 'journal_entries', dominio: 'diario', cuantos: 5000 });

    const listado = await anotar(
      'listar 5000 registros (SQLite)',
      () => almacen.listar('journal_entries'),
      { repeticiones: 10 },
    );
    const uno = await anotar('obtener 1 registro por id (SQLite)', (vuelta) =>
      almacen.obtener('journal_entries', `journal_entries-${vuelta % 5000}`),
    );

    await ejecutor.cerrar();

    // El presupuesto son 100 ms en un teléfono; aquí se exige holgura, porque
    // lo que se busca es un desastre, no un décimo de milisegundo.
    expect(listado.mediana).toBeLessThan(1000);
    expect(uno.mediana).toBeLessThan(20);
  });

  it('listar crece de forma proporcional al número de registros', async () => {
    const medirListado = async (cuantos: number): Promise<Medicion> => {
      const ejecutor = crearEjecutorNodeSqlite();
      const almacen = await crearAlmacenSqlite(ejecutor);
      await llenar(almacen, { tipo: 'prayers', dominio: 'oracion', cuantos });
      const medicion = await anotar(
        `listar ${cuantos} registros (SQLite)`,
        () => almacen.listar('prayers'),
        { repeticiones: 10 },
      );
      await ejecutor.cerrar();
      return medicion;
    };

    const pocos = await medirListado(500);
    const muchos = await medirListado(5000);

    // Diez veces más registros: hasta treinta veces más coste se acepta como
    // lineal con ruido. Cien veces sería cuadrático, y eso es un defecto.
    expect(factorDeCrecimiento(pocos, muchos)).toBeLessThan(30);
  });
});

// ── Abrir un capítulo de la Biblia ────────────────────────────────────────
//
// El caso que más se repite en la aplicación y el que más sospechas levanta:
// `delCapitulo` descifra **todos** los subrayados de la persona para pintar
// uno solo. Aquí se ve si eso importa.

describe('abrir un capítulo con subrayados', () => {
  async function conSubrayados(cuantos: number) {
    const almacen = crearAlmacenEnMemoria();
    const clave = claves.de('notaBiblica');

    for (let indice = 0; indice < cuantos; indice += 1) {
      await almacen.guardar(
        registro({
          tipo: 'bible_highlights',
          dominio: 'notaBiblica',
          indice,
          parrafos: 1,
          metadatos: {
            translation_id: 'traduccion-1',
            // Repartidos por libros distintos: solo una fracción cae en el
            // capítulo que se abre, igual que en una Biblia de verdad.
            book_code: `L${indice % 66}`,
            chapter_number: (indice % 40) + 1,
            verse_start: (indice % 20) + 1,
            verse_end: (indice % 20) + 3,
            highlight_style: 'amarillo',
          },
        }),
      );
    }

    const repositorio = crearRepositorioMarcasBiblicas({
      almacen,
      usuarioId: USUARIO,
      motor: crearMotorSincronizacion({
        almacen,
        remoto: crearServidorEnMemoria(),
        usuarioId: USUARIO,
        dispositivoId: 'dispositivo-medicion',
      }),
      claveNotas: () => clave,
      claveHash: () => claves.derivadas.claveHash,
    });

    return repositorio;
  }

  it('el coste de abrir un capítulo depende de cuántos subrayados hay en toda la Biblia', async () => {
    const pocos = await conSubrayados(200);
    const muchos = await conSubrayados(3000);
    const capitulo = { traduccionId: 'traduccion-1', libro: 'L5', capitulo: 6 };

    const conPocos = await anotar('abrir capítulo · 200 subrayados', () =>
      pocos.delCapitulo(capitulo),
    );
    const conMuchos = await anotar('abrir capítulo · 3000 subrayados', () =>
      muchos.delCapitulo(capitulo),
    );

    // Se documenta el crecimiento, no se prohíbe: es lineal por construcción
    // y esa es justamente la observación que importa. Quince veces más
    // subrayados, quince veces más coste, aunque el capítulo tenga los mismos.
    expect(factorDeCrecimiento(conPocos, conMuchos)).toBeGreaterThan(3);
    // Presupuesto: «apertura de contenido privado < 500 ms». Con holgura.
    expect(conMuchos.mediana).toBeLessThan(2000);
  });
});

// ── Abrir el Diario ───────────────────────────────────────────────────────
//
// La lista más larga de la aplicación, y la que más crece: quien escribe a
// diario durante cinco años tiene casi dos mil entradas. El repositorio
// descifra todas para pintarla.

describe('abrir la lista del Diario', () => {
  async function conEntradas(cuantas: number) {
    const almacen = crearAlmacenEnMemoria();
    await llenar(almacen, {
      tipo: 'journal_entries',
      dominio: 'diario',
      cuantos: cuantas,
      metadatos: { entry_type: 'libre', entry_date: '2024-01-01', is_favorite: false },
    });

    return crearRepositorioDiario({
      almacen,
      usuarioId: USUARIO,
      motor: crearMotorSincronizacion({
        almacen,
        remoto: crearServidorEnMemoria(),
        usuarioId: USUARIO,
        dispositivoId: 'dispositivo-medicion',
      }),
      claveDiario: () => claves.de('diario'),
      claveHash: () => claves.derivadas.claveHash,
    });
  }

  it('el coste crece con el total de entradas escritas', async () => {
    const pocas = await conEntradas(300);
    const muchas = await conEntradas(3000);

    const conPocas = await anotar('listar Diario · 300 entradas', () => pocas.listar(), {
      repeticiones: 10,
    });
    const conMuchas = await anotar('listar Diario · 3000 entradas', () => muchas.listar(), {
      repeticiones: 10,
    });

    // Diez veces más entradas escritas a lo largo de los años, diez veces más
    // coste al abrir la pantalla, aunque en ella quepan las mismas doce.
    expect(factorDeCrecimiento(conPocas, conMuchas)).toBeGreaterThan(3);
  });
});

// ── Exportación ───────────────────────────────────────────────────────────
//
// La operación más pesada de la aplicación: descifra la vida entera de una
// persona de una vez. No tiene presupuesto propio en el Documento 14 —no es
// una acción frecuente— pero sí tiene que terminar.

describe('exportar todo el contenido', () => {
  it('una cuenta de años de uso', async () => {
    const almacen = crearAlmacenEnMemoria();

    const volumen: readonly { tipo: string; dominio: DominioCifrado; cuantos: number }[] = [
      { tipo: 'journal_entries', dominio: 'diario', cuantos: 1800 },
      { tipo: 'prayers', dominio: 'oracion', cuantos: 600 },
      { tipo: 'habit_logs', dominio: 'habito', cuantos: 3000 },
      { tipo: 'bible_notes', dominio: 'notaBiblica', cuantos: 700 },
      { tipo: 'bible_highlights', dominio: 'notaBiblica', cuantos: 3000 },
      { tipo: 'ai_messages', dominio: 'ia', cuantos: 2000 },
      { tipo: 'spiritual_pulses', dominio: 'pulso', cuantos: 1500 },
    ];

    for (const modulo of volumen) {
      await llenar(almacen, {
        tipo: modulo.tipo,
        dominio: modulo.dominio,
        cuantos: modulo.cuantos,
        parrafos: 1,
      });
    }
    const total = volumen.reduce((suma, modulo) => suma + modulo.cuantos, 0);

    const exportacion = await anotar(
      `exportar ${total} registros`,
      () =>
        exportarContenido({
          almacen,
          usuarioId: USUARIO,
          claveDeDominio: claves.de,
        }),
      { repeticiones: 5 },
    );

    // No hay presupuesto, pero sí un límite de lo razonable: por encima de
    // esto la pantalla necesitaría trocear el trabajo para no congelarse.
    expect(exportacion.mediana).toBeLessThan(30_000);
  }, 300_000);
});
