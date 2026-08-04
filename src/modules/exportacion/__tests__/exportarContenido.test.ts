// Exportar el contenido privado.
//
// Dos pruebas mandan sobre el resto de este archivo:
//
//   1. **Que no falte ningún módulo.** Un módulo olvidado en la tabla produce
//      una copia incompleta con buena pinta, y quien la use para migrar o para
//      borrar su cuenta perderá cosas sin enterarse. Se comprueba contra los
//      tipos de entidad reales, no contra una lista escrita a mano aquí.
//
//   2. **Que no salga ninguna clave.** Alguien puede compartir su exportación
//      pensando que es «solo mi diario»; si llevara la clave dentro estaría
//      entregando también todo lo que suba en el futuro.
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  cifrar,
  crearClaveContenido,
  derivarClaves,
  generarClaveMaestra,
} from '@shared/services/crypto/servicioCriptografia';
import { DOMINIOS_CIFRADO, type DominioCifrado } from '@shared/services/crypto/tipos';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';

// Los tipos de entidad reales, tomados de cada repositorio. Importarlos es lo
// que hace que la primera prueba valga: una lista copiada aquí se quedaría
// desfasada en silencio, que es justo el fallo que se quiere evitar.
import { TIPO_ARCHIVO } from '@modules/archivos/repositories/repositorioArchivos';
import {
  TIPO_MARCADOR,
  TIPO_SUBRAYADO,
} from '@modules/biblia/repositories/repositorioMarcasBiblicas';
import { TIPO_NOTA as TIPO_NOTA_BIBLICA } from '@modules/biblia/repositories/repositorioNotasBiblicas';
import { TIPO_ELEMENTO } from '@modules/biblioteca-vida/repositories/repositorioBiblioteca';
import { TIPO_ENTIDAD as TIPO_ENTRADA_DIARIO } from '@modules/diario/repositories/repositorioDiario';
import { TIPO_HABITO, TIPO_REGISTRO } from '@modules/habitos/repositories/repositorioHabitos';
import { TIPO_CONVERSACION, TIPO_MENSAJE } from '@modules/ia/repositories/repositorioIa';
import { TIPO_MEMORIAL } from '@modules/memorial/repositories/repositorioMemorial';
import { TIPO_AVANCE, TIPO_PETICION } from '@modules/oracion/repositories/repositorioOracion';
import {
  TIPO_INSCRIPCION,
  TIPO_PROGRESO,
} from '@modules/planes/repositories/repositorioSeguimiento';
import { TIPO_PULSO } from '@modules/pulso/repositories/repositorioPulso';
import {
  TIPO_ACCION,
  TIPO_NOTA as TIPO_NOTA_SERMON,
} from '@modules/sermones/repositories/repositorioNotasSermon';

import { comoTexto, exportarContenido, MODULOS_EXPORTABLES } from '../use-cases/exportarContenido';
import { CAMPOS_PROHIBIDOS, nombreDeArchivo } from '../models/exportacion';

const USUARIO = 'usuario-1';
const DIARIO = 'Hoy le confesé a Dios algo que no le he dicho a nadie.';

function montar() {
  const almacen = crearAlmacenEnMemoria();
  const derivadas = derivarClaves(generarClaveMaestra());
  const claves = new Map<DominioCifrado, ReturnType<typeof crearClaveContenido>>(
    DOMINIOS_CIFRADO.map((dominio) => [dominio, crearClaveContenido(dominio)]),
  );
  const claveDeDominio = (dominio: DominioCifrado) => {
    const clave = claves.get(dominio);
    if (clave === undefined) throw new Error(`sin clave para ${dominio}`);
    return clave;
  };

  const motor = crearMotorSincronizacion({
    almacen,
    remoto: crearServidorEnMemoria(),
    usuarioId: USUARIO,
    dispositivoId: 'dispositivo-1',
  });

  /** Escribe un registro como lo haría su repositorio. */
  const escribir = async (parametros: {
    readonly tipo: string;
    readonly dominio: DominioCifrado;
    readonly contenido: unknown;
    readonly metadatos?: Record<string, string | number | boolean | null>;
    readonly id?: string;
  }) => {
    const id = parametros.id ?? `${parametros.tipo}-1`;
    return motor.registrarCambioLocal({
      id,
      tipoEntidad: parametros.tipo,
      sobre: cifrar({
        contenido: JSON.stringify(parametros.contenido),
        clave: claveDeDominio(parametros.dominio),
        claveHash: derivadas.claveHash,
        vinculo: { usuarioId: USUARIO, tipoEntidad: parametros.tipo, entidadId: id },
      }),
      metadatos: parametros.metadatos ?? {},
    });
  };

  return {
    almacen,
    motor,
    derivadas,
    claveDeDominio,
    escribir,
    exportar: () =>
      exportarContenido({
        almacen,
        usuarioId: USUARIO,
        claveDeDominio,
        ahora: () => '2026-08-04T10:00:00.000Z',
        version: '1.0.0',
      }),
  };
}

describe('cobertura de módulos', () => {
  it('la tabla de exportación cubre todos los tipos de entidad que existen', async () => {
    // Es la prueba más importante del archivo. Un módulo nuevo que se olvide
    // aquí no rompe nada: simplemente no sale, y quien exporte antes de borrar
    // su cuenta perderá ese módulo entero sin que nada se lo diga.
    const tiposReales = [
      TIPO_ENTRADA_DIARIO,
      TIPO_PETICION,
      TIPO_AVANCE,
      TIPO_HABITO,
      TIPO_REGISTRO,
      TIPO_NOTA_BIBLICA,
      TIPO_SUBRAYADO,
      TIPO_MARCADOR,
      TIPO_ELEMENTO,
      TIPO_MEMORIAL,
      TIPO_CONVERSACION,
      TIPO_MENSAJE,
      TIPO_NOTA_SERMON,
      TIPO_ACCION,
      TIPO_PULSO,
      TIPO_INSCRIPCION,
      TIPO_PROGRESO,
      TIPO_ARCHIVO,
    ];
    const exportables = new Set(MODULOS_EXPORTABLES.map((modulo) => modulo.tipo));

    const olvidados = tiposReales.filter((tipo) => !exportables.has(tipo));
    expect(olvidados).toEqual([]);
  });

  it('no exporta tipos que no existen', async () => {
    // Al revés también importa: una línea sobrante produce un módulo vacío en
    // el archivo y hace dudar de si falta contenido o si nunca lo hubo.
    const tiposReales = new Set([
      TIPO_ENTRADA_DIARIO,
      TIPO_PETICION,
      TIPO_AVANCE,
      TIPO_HABITO,
      TIPO_REGISTRO,
      TIPO_NOTA_BIBLICA,
      TIPO_SUBRAYADO,
      TIPO_MARCADOR,
      TIPO_ELEMENTO,
      TIPO_MEMORIAL,
      TIPO_CONVERSACION,
      TIPO_MENSAJE,
      TIPO_NOTA_SERMON,
      TIPO_ACCION,
      TIPO_PULSO,
      TIPO_INSCRIPCION,
      TIPO_PROGRESO,
      TIPO_ARCHIVO,
    ]);

    const sobrantes = MODULOS_EXPORTABLES.map((m) => m.tipo).filter(
      (tipo) => !tiposReales.has(tipo),
    );
    expect(sobrantes).toEqual([]);
  });

  it('cada módulo declara un dominio que existe', () => {
    const dominios = new Set<string>(DOMINIOS_CIFRADO);
    const invalidos = MODULOS_EXPORTABLES.filter((m) => !dominios.has(m.dominio));
    expect(invalidos).toEqual([]);
  });
});

describe('lo que nunca puede salir', () => {
  it('no aparece ninguna clave ni la frase de recuperación', async () => {
    const { escribir, exportar } = montar();
    await escribir({ tipo: 'journal_entries', dominio: 'diario', contenido: { texto: DIARIO } });

    const texto = comoTexto(await exportar());

    for (const campo of CAMPOS_PROHIBIDOS) {
      expect(texto).not.toContain(`"${campo}"`);
    }
  });

  it('no queda rastro del sobre cifrado', async () => {
    // En un archivo ya descifrado, el criptograma y su nonce no significan
    // nada y darían a entender que ahí queda algo por abrir.
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'journal_entries',
      dominio: 'diario',
      contenido: { texto: DIARIO },
      metadatos: { entry_type: 'reflection', entry_date: '2026-08-04' },
    });

    const texto = comoTexto(await exportar());
    expect(texto).not.toContain('encrypted_payload');
    expect(texto).not.toContain('content_hash');
    // Lo que el servidor sí veía sí se conserva: es parte de sus datos.
    expect(texto).toContain('entry_date');
  });

  it('la ficha de un archivo privado no arrastra su sobre', async () => {
    // Los archivos guardan el suyo en los metadatos, con nombres propios: la
    // clave envuelta y el nonce del contenido. Es el sitio donde más fácil se
    // cuela, porque no se llaman como en las demás tablas.
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'private_media',
      dominio: 'medios',
      contenido: { nombre: 'carta.pdf' },
      metadatos: {
        mime_type: 'application/pdf',
        storage_path: `${USUARIO}/archivo-1`,
        encrypted_file_key: '{"envoltorioBase64":"secreto"}',
        file_nonce: 'nonce-del-archivo',
        content_hash: 'hmac',
        key_id: 'clave-1',
      },
    });

    const texto = comoTexto(await exportar());

    expect(texto).not.toContain('encrypted_file_key');
    expect(texto).not.toContain('file_nonce');
    expect(texto).not.toContain('envoltorioBase64');
    // Lo que sí es suyo se conserva.
    expect(texto).toContain('storage_path');
  });

  it('la red de seguridad para un campo prohibido antes de entregar el archivo', async () => {
    // Simula el descuido que existe para atrapar: alguien añade al modelo un
    // campo con material sensible. El archivo no debe llegar a salir.
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'journal_entries',
      dominio: 'diario',
      contenido: { texto: DIARIO, claveMaestra: 'esto-no-puede-salir' },
    });

    await expect(exportar()).rejects.toThrow(/nunca debe salir del dispositivo/);
  });

  it('el aviso no nombra el campo: acabaría en un informe de errores', async () => {
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'journal_entries',
      dominio: 'diario',
      contenido: { claveMaestra: 'esto-no-puede-salir' },
    });

    await expect(exportar()).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('claveMaestra') }),
    );
  });

  it('escribir en el diario una de esas palabras no bloquea la exportación', async () => {
    // La red de seguridad mira nombres de campo, no texto. Si mirara el JSON
    // serializado, una entrada que dijera exactamente «material» impediría a
    // esa persona llevarse su propia vida.
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'journal_entries',
      dominio: 'diario',
      contenido: { texto: 'material' },
    });

    await expect(exportar()).resolves.toMatchObject({ version: 1 });
  });

  it('el nombre del archivo no lleva el identificador de nadie', async () => {
    // Acaba en la lista de descargas, en la vista previa al compartirlo y en
    // cualquier copia de seguridad automática (invariante 2).
    const nombre = nombreDeArchivo('2026-08-04T10:00:00.000Z');

    expect(nombre).toBe('qfaith-2026-08-04.json');
    expect(nombre).not.toContain(USUARIO);
  });
});

describe('qué se lleva', () => {
  it('el contenido sale legible, no cifrado', async () => {
    const { escribir, exportar } = montar();
    await escribir({ tipo: 'journal_entries', dominio: 'diario', contenido: { texto: DIARIO } });

    const exportacion = await exportar();
    const diario = exportacion.modulos.find((m) => m.tipo === 'journal_entries');

    // Es lo que significa portabilidad: que otro programa pueda leerlo.
    expect(diario?.registros[0]?.contenido).toEqual({ texto: DIARIO });
  });

  it('lo que está en la papelera va marcado, no escondido', async () => {
    // Quien exporta antes de borrar su cuenta querría precisamente eso, y
    // ocultarlo sería entregar una copia incompleta sin decirlo.
    const { escribir, motor, exportar } = montar();
    await escribir({
      tipo: 'memorials',
      dominio: 'memorial',
      contenido: { texto: 'Un recuerdo.' },
    });
    await motor.registrarEliminacionLocal('memorials', 'memorials-1');

    const memorial = (await exportar()).modulos.find((m) => m.tipo === 'memorials');

    expect(memorial?.registros).toHaveLength(1);
    expect(memorial?.registros[0]?.enPapeleraDesde).toEqual(expect.any(String));
  });

  it('lo vigente no lleva la marca de papelera', async () => {
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'memorials',
      dominio: 'memorial',
      contenido: { texto: 'Un recuerdo.' },
    });

    const memorial = (await exportar()).modulos.find((m) => m.tipo === 'memorials');
    expect(memorial?.registros[0]).not.toHaveProperty('enPapeleraDesde');
  });

  it('lleva un recuento por módulo para poder comprobar que está completa', async () => {
    const { escribir, exportar } = montar();
    await escribir({ tipo: 'journal_entries', dominio: 'diario', contenido: { texto: DIARIO } });
    await escribir({ tipo: 'prayers', dominio: 'oracion', contenido: { titulo: 'Por mi padre' } });

    const exportacion = await exportar();

    // Sin esto, un fallo que se lleve un módulo entero produce un archivo con
    // buena pinta y un hueco invisible.
    expect(exportacion.resumen['journal_entries']).toBe(1);
    expect(exportacion.resumen['prayers']).toBe(1);
    expect(exportacion.resumen['habits']).toBe(0);
  });

  it('una cuenta vacía produce una exportación válida, no un error', async () => {
    const { exportar } = montar();

    const exportacion = await exportar();

    expect(exportacion.modulos).toHaveLength(MODULOS_EXPORTABLES.length);
    expect(exportacion.ilegiblesEnTotal).toBe(0);
  });

  it('los archivos privados salen como ficha, no como bytes', async () => {
    // Un JSON con cincuenta megas de fotografías dentro no lo abre nadie.
    const { escribir, exportar } = montar();
    await escribir({
      tipo: 'private_media',
      dominio: 'medios',
      contenido: { nombre: 'carta.pdf' },
      metadatos: { mime_type: 'application/pdf', file_size_bytes: 4821 },
    });

    const archivos = (await exportar()).modulos.find((m) => m.tipo === 'private_media');
    expect(archivos?.registros[0]?.datos).toMatchObject({ mime_type: 'application/pdf' });
  });
});

describe('lo que no se puede abrir', () => {
  it('un registro ilegible no detiene la exportación', async () => {
    // Pasa cuando el aparato recibió contenido cifrado con una clave de
    // dominio que no tiene. El resto de la vida de la persona sí se puede
    // llevar.
    const { escribir, exportar } = montar();
    await escribir({ tipo: 'journal_entries', dominio: 'diario', contenido: { texto: DIARIO } });
    // Cifrado con la clave equivocada: se comporta como uno que no abre.
    await escribir({
      tipo: 'prayers',
      dominio: 'diario',
      contenido: { titulo: 'Por mi padre' },
    });

    const exportacion = await exportar();

    expect(exportacion.resumen['journal_entries']).toBe(1);
    expect(exportacion.resumen['prayers']).toBe(0);
  });

  it('y se cuenta, porque no se le puede ocultar a quien exporta', async () => {
    const { escribir, exportar } = montar();
    await escribir({ tipo: 'prayers', dominio: 'diario', contenido: { titulo: 'Por mi padre' } });

    const exportacion = await exportar();

    expect(exportacion.ilegiblesEnTotal).toBe(1);
    expect(exportacion.modulos.find((m) => m.tipo === 'prayers')?.ilegibles).toBe(1);
  });
});

describe('forma del archivo', () => {
  it('se puede leer con sangría, no solo procesar', async () => {
    const { exportar } = montar();

    const texto = comoTexto(await exportar());

    expect(texto).toContain('\n  ');
    expect(JSON.parse(texto)).toMatchObject({ version: 1 });
  });

  it('dice qué versión del formato es y cuándo se generó', async () => {
    // Sin la versión, un lector futuro no sabría si puede fiarse de la forma.
    const { exportar } = montar();

    expect(await exportar()).toMatchObject({
      version: 1,
      generadaEn: '2026-08-04T10:00:00.000Z',
      aplicacion: 'QFaith 1.0.0',
    });
  });
});
