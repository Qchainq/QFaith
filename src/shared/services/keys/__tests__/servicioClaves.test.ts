// Pruebas de la gestión de claves. Ejercitan el ciclo completo: alta de
// cuenta, bloqueo, desbloqueo, restauración en un dispositivo nuevo y
// rotación.
import * as AlmacenSeguro from 'expo-secure-store';

import { aBase64 } from '../../crypto/codificacion';
import { cifrar, descifrar } from '../../crypto/servicioCriptografia';
import type { VinculoRegistro } from '../../crypto/tipos';
import {
  bloquear,
  claveDeDominio,
  clavesDerivadas,
  desbloquear,
  estaDesbloqueada,
  inicializarCuenta,
  olvidarDispositivo,
  restaurarConFrase,
  rotarClaveDeDominio,
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

const nuevaCuenta = () => inicializarCuenta({ ajustesKdf: KDF_RAPIDO });

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

    expect(await desbloquear(material.sobresClaves)).toBe(true);
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

    expect(await desbloquear(material.sobresClaves)).toBe(false);
    expect(estaDesbloqueada()).toBe(false);
  });

  it('cerrar sesión borra la clave del dispositivo', async () => {
    const material = await nuevaCuenta();
    await olvidarDispositivo();

    expect(AlmacenSeguro.deleteItemAsync).toHaveBeenCalled();
    expect(await desbloquear(material.sobresClaves)).toBe(false);
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
      frase: material.fraseRecuperacion,
      sobreRecuperacion: material.sobreRecuperacion,
      sobresClaves: material.sobresClaves,
    });

    bloquear();
    expect(await desbloquear(material.sobresClaves)).toBe(true);
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
    expect(await desbloquear(sobresConAmbas)).toBe(true);
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
        frase: cuentaB.fraseRecuperacion,
        sobreRecuperacion: cuentaB.sobreRecuperacion,
        sobresClaves: cuentaA.sobresClaves,
      }),
    ).rejects.toThrow(expect.objectContaining({ codigo: 'ENVOLTORIO_INVALIDO' }));
  });
});

describe('caminos poco frecuentes', () => {
  it('desbloquear con la sesión ya abierta no vuelve a leer el almacén', async () => {
    const material = await nuevaCuenta();
    jest.clearAllMocks();

    expect(await desbloquear(material.sobresClaves)).toBe(true);
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
    await desbloquear(sinDiario);

    expect(() => claveDeDominio('diario')).toThrow(
      expect.objectContaining({ codigo: 'CLAVE_DOMINIO_AUSENTE' }),
    );
    expect(claveDeDominio('oracion')).toBeDefined();
  });
});
