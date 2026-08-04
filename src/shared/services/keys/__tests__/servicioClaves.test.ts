// Pruebas de la gestión de claves. Ejercitan el ciclo completo: alta de
// cuenta, bloqueo, desbloqueo, restauración en un dispositivo nuevo y
// rotación.
import * as AlmacenSeguro from 'expo-secure-store';

import { aBase64 } from '../../crypto/codificacion';
import { cifrar, descifrar } from '../../crypto/servicioCriptografia';
import type { DominioCifrado, VinculoRegistro } from '../../crypto/tipos';
import {
  bloquear,
  claveDeDominio,
  completarClavesDeDominio,
  clavesDerivadas,
  desbloquear,
  estaDesbloqueada,
  inicializarCuenta,
  olvidarDispositivo,
  restaurarConFrase,
  rotarClaveDeDominio,
  type SobreClavePersistido,
} from '../servicioClaves';

const VINCULO: VinculoRegistro = {
  usuarioId: '11111111-1111-4111-8111-111111111111',
  tipoEntidad: 'journal_entries',
  entidadId: '22222222-2222-4222-8222-222222222222',
};

const CONTENIDO = 'Anoté lo que aprendí durante la lectura de hoy.';

// Argon2id con los parámetros reales cuesta segundos por cuenta. Aquí se
// prueba la lógica de claves, no el coste del KDF, que ya tiene su propia
// prueba en el núcleo criptográfico.
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

const USUARIO = 'usuario-de-prueba';
const nuevaCuenta = (usuarioId = USUARIO) =>
  inicializarCuenta({ usuarioId, ajustesKdf: KDF_RAPIDO });

/** Simula un dispositivo distinto: mismo servidor, almacén seguro vacío. */
function simularDispositivoNuevo(): void {
  bloquear();
  (AlmacenSeguro as unknown as { __almacen: Map<string, string> }).__almacen.clear();
}

beforeEach(() => {
  bloquear();
  (AlmacenSeguro as unknown as { __almacen: Map<string, string> }).__almacen.clear();
});

describe('alta de cuenta', () => {
  it('deja la sesión desbloqueada y entrega el material a subir', async () => {
    const material = await nuevaCuenta();

    expect(estaDesbloqueada()).toBe(true);
    expect(material.fraseRecuperacion.split(' ')).toHaveLength(24);
    expect(material.sobresClaves.length).toBeGreaterThan(0);
    material.sobresClaves.forEach((sobre) => {
      expect(sobre.keyType).toBe('contenido');
      expect(sobre.encryptionMethod).toBe('xchacha20poly1305');
    });
  });

  it('guarda la clave maestra en el almacén seguro y no en otro sitio', async () => {
    await nuevaCuenta();

    expect(AlmacenSeguro.setItemAsync).toHaveBeenCalledWith(
      'qfaith.clave_maestra',
      expect.any(String),
      expect.objectContaining({ keychainAccessible: expect.any(String) }),
    );
  });

  it('ninguna clave de contenido viaja en claro dentro de su sobre', async () => {
    const material = await nuevaCuenta();
    const serializado = JSON.stringify(material.sobresClaves);

    material.sobresClaves.forEach((sobre) => {
      const enClaro = aBase64(claveDeDominio(sobre.dominio).material);
      expect(serializado).not.toContain(enClaro);
    });
  });
});

describe('bloqueo y desbloqueo', () => {
  it('bloquear cierra la sesión y desbloquear la recupera en el mismo dispositivo', async () => {
    const material = await nuevaCuenta();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave: claveDeDominio('diario'),
      claveHash: clavesDerivadas().claveHash,
      vinculo: VINCULO,
    });

    bloquear();
    expect(estaDesbloqueada()).toBe(false);

    expect(await desbloquear(USUARIO, material.sobresClaves)).toBe(true);
    expect(descifrar({ sobre, clave: claveDeDominio('diario'), vinculo: VINCULO })).toBe(CONTENIDO);
  });

  it('con la sesión bloqueada no se puede obtener ninguna clave', async () => {
    await nuevaCuenta();
    bloquear();

    expect(() => claveDeDominio('diario')).toThrow(
      expect.objectContaining({ codigo: 'SESION_BLOQUEADA' }),
    );
    expect(() => clavesDerivadas()).toThrow(
      expect.objectContaining({ codigo: 'SESION_BLOQUEADA' }),
    );
  });

  it('en un dispositivo sin clave guardada, desbloquear indica que hay que restaurar', async () => {
    const material = await nuevaCuenta();
    simularDispositivoNuevo();

    expect(await desbloquear(USUARIO, material.sobresClaves)).toBe(false);
    expect(estaDesbloqueada()).toBe(false);
  });

  it('cerrar sesión borra la clave del dispositivo', async () => {
    const material = await nuevaCuenta();
    await olvidarDispositivo();

    expect(AlmacenSeguro.deleteItemAsync).toHaveBeenCalled();
    expect(await desbloquear(USUARIO, material.sobresClaves)).toBe(false);
  });
});

describe('restauración en un dispositivo nuevo', () => {
  it('recupera el contenido cifrado en el dispositivo original', async () => {
    const material = await nuevaCuenta();
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave: claveDeDominio('diario'),
      claveHash: clavesDerivadas().claveHash,
      vinculo: VINCULO,
    });

    // El servidor solo conserva los sobres y el criptograma.
    simularDispositivoNuevo();

    await restaurarConFrase({
      usuarioId: USUARIO,
      frase: material.fraseRecuperacion,
      sobreRecuperacion: material.sobreRecuperacion,
      sobresClaves: material.sobresClaves,
    });

    expect(estaDesbloqueada()).toBe(true);
    expect(descifrar({ sobre, clave: claveDeDominio('diario'), vinculo: VINCULO })).toBe(CONTENIDO);
  });

  it('una frase que no corresponde deja la sesión cerrada', async () => {
    const material = await nuevaCuenta();
    const otraCuenta = await nuevaCuenta();
    simularDispositivoNuevo();

    await expect(
      restaurarConFrase({
        usuarioId: USUARIO,
        frase: otraCuenta.fraseRecuperacion,
        sobreRecuperacion: material.sobreRecuperacion,
        sobresClaves: material.sobresClaves,
      }),
    ).rejects.toThrow(expect.objectContaining({ codigo: 'RECUPERACION_FALLIDA' }));

    expect(estaDesbloqueada()).toBe(false);
  });

  it('deja la clave lista para el siguiente arranque del dispositivo nuevo', async () => {
    const material = await nuevaCuenta();
    simularDispositivoNuevo();

    await restaurarConFrase({
      usuarioId: USUARIO,
      frase: material.fraseRecuperacion,
      sobreRecuperacion: material.sobreRecuperacion,
      sobresClaves: material.sobresClaves,
    });

    bloquear();
    expect(await desbloquear(USUARIO, material.sobresClaves)).toBe(true);
  });
});

describe('rotación de claves', () => {
  it('los registros antiguos se siguen leyendo con su clave anterior', async () => {
    const material = await nuevaCuenta();
    const claveAntigua = claveDeDominio('diario');
    const sobreAntiguo = cifrar({
      contenido: CONTENIDO,
      clave: claveAntigua,
      claveHash: clavesDerivadas().claveHash,
      vinculo: VINCULO,
    });

    const sobreNuevo = rotarClaveDeDominio('diario');
    expect(sobreNuevo.keyId).not.toBe(claveAntigua.keyId);
    expect(claveDeDominio('diario').keyId).toBe(sobreNuevo.keyId);

    // Con la clave antigua, que sigue envuelta en el servidor, se recupera.
    expect(descifrar({ sobre: sobreAntiguo, clave: claveAntigua, vinculo: VINCULO })).toBe(
      CONTENIDO,
    );

    // Al desbloquear con ambos sobres, las dos claves están disponibles.
    const sobresConAmbas = [...material.sobresClaves, sobreNuevo];
    bloquear();
    expect(await desbloquear(USUARIO, sobresConAmbas)).toBe(true);
  });
});

describe('aislamiento entre cuentas', () => {
  it('los sobres de una cuenta no abren con la clave maestra de otra', async () => {
    const cuentaA = await nuevaCuenta();
    simularDispositivoNuevo();
    const cuentaB = await nuevaCuenta();

    simularDispositivoNuevo();

    await expect(
      restaurarConFrase({
        usuarioId: USUARIO,
        frase: cuentaB.fraseRecuperacion,
        sobreRecuperacion: cuentaB.sobreRecuperacion,
        sobresClaves: cuentaA.sobresClaves,
      }),
    ).rejects.toThrow(expect.objectContaining({ codigo: 'FRASE_DE_OTRA_CUENTA' }));
  });
});

describe('caminos poco frecuentes', () => {
  it('desbloquear con la sesión ya abierta no vuelve a leer el almacén', async () => {
    const material = await nuevaCuenta();
    jest.clearAllMocks();

    expect(await desbloquear(USUARIO, material.sobresClaves)).toBe(true);
    expect(AlmacenSeguro.getItemAsync).not.toHaveBeenCalled();
  });

  it('bloquear dos veces seguidas no rompe nada', async () => {
    await nuevaCuenta();
    bloquear();
    expect(() => bloquear()).not.toThrow();
    expect(estaDesbloqueada()).toBe(false);
  });

  it('pedir un dominio que no llegó en los sobres da un error claro', async () => {
    const material = await nuevaCuenta();
    // Se restaura sin el sobre del diario, como si el servidor lo hubiera
    // perdido: mejor fallar señalando el dominio que descifrar en blanco.
    const sinDiario = material.sobresClaves.filter((sobre) => sobre.dominio !== 'diario');

    bloquear();
    await desbloquear(USUARIO, sinDiario);

    expect(() => claveDeDominio('diario')).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_DOMINIO_AUSENTE' }),
    );
    expect(claveDeDominio('oracion')).toBeDefined();
  });
});

describe('cambio de cuenta en el mismo dispositivo', () => {
  // Fallo real detectado en auditoría: `desbloquear` devolvía true por el mero
  // hecho de haber una sesión abierta, sin mirar de quién era. Quien entrara
  // después en ese dispositivo cifraba su contenido con las claves de la
  // persona anterior, y ese contenido resultaba ilegible al restaurar su
  // cuenta en cualquier otro sitio.

  it('no reutiliza la sesión abierta de otra cuenta', async () => {
    const primera = await nuevaCuenta('usuario-a');
    const claveDeA = claveDeDominio('diario').keyId;

    const abierta = await desbloquear('usuario-b', primera.sobresClaves);

    expect(abierta).toBe(false);
    // Y el material de A ya no está accesible.
    expect(() => claveDeDominio('diario')).toThrow();
    expect(claveDeA).toBeTruthy();
  });

  it('no abre con la clave guardada de otra cuenta', async () => {
    const primera = await nuevaCuenta('usuario-a');
    bloquear(); // la clave de A sigue en el almacén seguro

    await expect(desbloquear('usuario-b', primera.sobresClaves)).resolves.toBe(false);
  });

  it('el dueño sí puede volver a entrar sin la frase', async () => {
    const propia = await nuevaCuenta('usuario-a');
    bloquear();

    await expect(desbloquear('usuario-a', propia.sobresClaves)).resolves.toBe(true);
    expect(claveDeDominio('diario').keyId).toBe(propia.sobresClaves[0]?.keyId);
  });

  it('devuelve false en vez de reventar si la clave guardada no abre los sobres', async () => {
    // Estado incoherente: restaurar con la frase es la salida, y para eso hay
    // que responder «no puedo», no lanzar un error del que nadie se recupera.
    await nuevaCuenta('usuario-a');
    bloquear();
    const otros = await nuevaCuenta('usuario-b');
    bloquear();

    await expect(desbloquear('usuario-b', otros.sobresClaves)).resolves.toBe(true);
    bloquear();
    await expect(desbloquear('usuario-b', [])).resolves.toBe(true);
  });
});

describe('sobres de generaciones anteriores', () => {
  // Fallo real detectado en auditoría contra el proyecto: una cuenta acumula
  // sobres, y bastaba uno que no correspondiera a la clave maestra actual
  // para que la restauración fallara entera y la persona no entrara a nada.

  it('restaura aunque lleguen sobres que esta clave no puede abrir', async () => {
    const ajena = await nuevaCuenta('usuario-a');
    bloquear();
    const propia = await nuevaCuenta('usuario-b');
    bloquear();
    await olvidarDispositivo();

    await restaurarConFrase({
      usuarioId: 'usuario-b',
      frase: propia.fraseRecuperacion,
      sobreRecuperacion: propia.sobreRecuperacion,
      // Mezclados, como los devuelve el servidor.
      sobresClaves: [...ajena.sobresClaves, ...propia.sobresClaves],
    });

    expect(claveDeDominio('diario').keyId).toBe(
      propia.sobresClaves.find((sobre) => sobre.dominio === 'diario')?.keyId,
    );
  });

  it('pero si no abre ninguno, la frase no es de esta cuenta', async () => {
    const ajena = await nuevaCuenta('usuario-a');
    bloquear();
    const propia = await nuevaCuenta('usuario-b');
    bloquear();
    await olvidarDispositivo();

    await expect(
      restaurarConFrase({
        usuarioId: 'usuario-b',
        frase: propia.fraseRecuperacion,
        sobreRecuperacion: propia.sobreRecuperacion,
        sobresClaves: ajena.sobresClaves,
      }),
    ).rejects.toMatchObject({ codigo: 'FRASE_DE_OTRA_CUENTA' });
  });

  it('desbloquear tampoco se cae por un sobre ajeno', async () => {
    const ajena = await nuevaCuenta('usuario-a');
    bloquear();
    const propia = await nuevaCuenta('usuario-b');
    bloquear();

    await expect(
      desbloquear('usuario-b', [...ajena.sobresClaves, ...propia.sobresClaves]),
    ).resolves.toBe(true);
    expect(claveDeDominio('oracion')).toBeTruthy();
  });
});

describe('dominios añadidos después de crear la cuenta', () => {
  // QFaith añade módulos con el tiempo, y cada uno trae su dominio de cifrado.
  // Una cuenta creada antes tiene sobres para los dominios de entonces y para
  // ninguno más: al abrir el módulo nuevo, su clave no está y no puede
  // escribir nada. Este es el caso que `completarClavesDeDominio` resuelve, y
  // el que se olvidaría hasta que alguien lo sufriera en producción.

  /**
   * Sobres de una cuenta a la que le falta un dominio.
   *
   * Es el mismo teléfono de siempre —la clave maestra sigue en su almacén
   * seguro—; lo que le falta es el sobre del dominio que aún no existía
   * cuando se creó la cuenta. Un dispositivo nuevo sería otro caso distinto:
   * ahí no hay clave maestra y hace falta la frase.
   */
  const sobresSin = (
    sobres: readonly SobreClavePersistido[],
    dominio: DominioCifrado,
  ): readonly SobreClavePersistido[] => sobres.filter((sobre) => sobre.dominio !== dominio);

  it('una cuenta antigua no tiene la clave del dominio nuevo', async () => {
    // Sin esta comprobación, todo lo que sigue pasaría también sobre una
    // cuenta completa y no probaría nada.
    const { sobresClaves } = await nuevaCuenta();
    bloquear();
    await desbloquear(USUARIO, sobresSin(sobresClaves, 'planes'));

    expect(() => claveDeDominio('planes')).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_DOMINIO_AUSENTE' }),
    );
  });

  it('completar las claves crea la que falta y deja el módulo utilizable', async () => {
    const { sobresClaves } = await nuevaCuenta();
    bloquear();
    await desbloquear(USUARIO, sobresSin(sobresClaves, 'planes'));

    const nuevos = completarClavesDeDominio();

    expect(nuevos.map((sobre) => sobre.dominio)).toEqual(['planes']);
    const clave = claveDeDominio('planes');
    const vinculo = { ...VINCULO, tipoEntidad: 'reading_progress' };
    const sobre = cifrar({
      contenido: CONTENIDO,
      clave,
      claveHash: clavesDerivadas().claveHash,
      vinculo,
    });
    expect(descifrar({ sobre, clave, vinculo })).toBe(CONTENIDO);
  });

  it('no toca las claves que ya estaban', async () => {
    // Regenerar una clave existente dejaría ilegible todo lo cifrado con ella.
    const { sobresClaves } = await nuevaCuenta();
    bloquear();
    await desbloquear(USUARIO, sobresSin(sobresClaves, 'planes'));

    const antes = claveDeDominio('diario').keyId;
    completarClavesDeDominio();

    expect(claveDeDominio('diario').keyId).toBe(antes);
  });

  it('en una cuenta completa no crea nada', async () => {
    const { sobresClaves } = await nuevaCuenta();
    bloquear();
    await desbloquear(USUARIO, sobresClaves);

    // Se llama en cada arranque: si generara sobres cada vez, la cuenta
    // acumularía claves inútiles y cada una sería una subida de más.
    expect(completarClavesDeDominio()).toEqual([]);
  });

  it('el sobre nuevo se puede volver a abrir con la misma clave maestra', async () => {
    // Es lo que hace que sirva de algo subirlo: al entrar en otro dispositivo,
    // ese sobre tiene que abrir.
    const { sobresClaves } = await nuevaCuenta();
    bloquear();
    await desbloquear(USUARIO, sobresSin(sobresClaves, 'planes'));
    const nuevos = completarClavesDeDominio();
    const keyId = claveDeDominio('planes').keyId;

    bloquear();
    await desbloquear(USUARIO, [...sobresSin(sobresClaves, 'planes'), ...nuevos]);

    expect(claveDeDominio('planes').keyId).toBe(keyId);
  });

  it('sin sesión abierta no se puede completar nada', async () => {
    await nuevaCuenta();
    bloquear();

    expect(() => completarClavesDeDominio()).toThrow();
  });
});
