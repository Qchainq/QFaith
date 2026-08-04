// Exportar de punta a punta: pantalla, claves, almacén y cifrado reales.
//
// Lo que se vigila aquí es lo que la persona ve y lo que se lleva. Dos cosas
// que no pueden fallar: que el aviso esté **antes** de generar el archivo, y
// que lo que sale no lleve ninguna clave dentro.
import { act, fireEvent, screen } from '@testing-library/react-native';

import { crearSincronizacionDePrueba } from '@modules/sincronizacion/__tests__/sincronizacionDePrueba';
import {
  ProveedorSincronizacion,
  type Sincronizacion,
} from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearRepositorioDiario } from '@modules/diario/repositories/repositorioDiario';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  bloquear,
  claveDeDominio,
  clavesDerivadas,
  inicializarCuenta,
  olvidarDispositivo,
} from '@shared/services/keys/servicioClaves';
import { cifrar } from '@shared/services/crypto/servicioCriptografia';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';
import { renderizar } from '@shared/testing/renderizar';

import { ExportarContenedor } from '../screens/ExportarContenedor';
import { CAMPOS_PROHIBIDOS } from '../models/exportacion';

const USUARIO = 'usuario-1';
const DIARIO = 'Le confesé a Dios algo que no le he dicho a nadie.';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

let sincronizacion: Sincronizacion;

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });

  sincronizacion = crearSincronizacionDePrueba({
    almacen: crearAlmacenEnMemoria(),
    usuarioId: USUARIO,
    remoto: crearServidorEnMemoria(),
  });
});

/** Escribe una entrada con el repositorio de verdad del diario. */
async function escribirDiario(): Promise<void> {
  const diario = crearRepositorioDiario({
    motor: sincronizacion.motor,
    almacen: sincronizacion.almacen,
    usuarioId: USUARIO,
    claveDiario: () => claveDeDominio('diario'),
    claveHash: () => clavesDerivadas().claveHash,
  });
  await diario.guardar({
    titulo: 'Confesión',
    cuerpo: DIARIO,
    etiquetas: [],
    tipo: 'reflection',
    fecha: '2026-08-04',
  });
}

const montar = (alCompartir?: (contenido: string) => void) =>
  renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
      sincronizarEnSegundoPlano={false}
    >
      <ExportarContenedor {...(alCompartir === undefined ? {} : { alCompartir })} />
    </ProveedorSincronizacion>,
  );

const generar = async () => {
  const boton = await screen.findByRole('button', { name: 'Preparar mi copia' });
  await act(async () => {
    fireEvent.press(boton);
  });
};

describe('antes de generarla', () => {
  it('avisa de que el archivo sale sin cifrar', async () => {
    // Antes, no después: quien pulsa ya sabe que va a tener toda su vida
    // espiritual junta y legible en un archivo.
    montar();

    expect(await screen.findByText(/sale sin cifrar/)).toBeTruthy();
  });

  it('explica que solo el teléfono puede hacerlo', async () => {
    // No es una nota técnica: es por qué esta pantalla está aquí y no en un
    // panel de soporte.
    montar();

    expect(await screen.findByText(/ni nosotros podemos hacerlo por ti/)).toBeTruthy();
  });
});

describe('lo que se lleva', () => {
  it('el contenido sale legible', async () => {
    await escribirDiario();
    montar();

    await generar();

    expect(await screen.findByText('Tu copia está lista.')).toBeTruthy();
    expect(await screen.findByText('Diario: 1')).toBeTruthy();
  });

  it('el archivo que se comparte no lleva ninguna clave', async () => {
    // Alguien puede compartir su exportación pensando que es «solo mi
    // diario»; si llevara la clave dentro estaría entregando también todo lo
    // que suba en el futuro.
    await escribirDiario();
    let compartido = '';
    montar((contenido) => {
      compartido = contenido;
    });

    await generar();
    const boton = await screen.findByRole('button', { name: 'Guardar o compartir' });
    await act(async () => {
      fireEvent.press(boton);
    });

    expect(compartido).toContain(DIARIO);
    for (const campo of CAMPOS_PROHIBIDOS) {
      expect(compartido).not.toContain(`"${campo}"`);
    }
  });

  it('solo se enseñan los módulos con algo dentro', async () => {
    // Una lista de dieciocho ceros no informa, agobia.
    await escribirDiario();
    montar();

    await generar();

    expect(await screen.findByText('Diario: 1')).toBeTruthy();
    expect(screen.queryByText('Hábitos: 0')).toBeNull();
  });

  it('una cuenta vacía lo dice sin dar a entender que algo falló', async () => {
    montar();

    await generar();

    expect(await screen.findByText('Todavía no hay nada que llevarte.')).toBeTruthy();
  });
});

describe('cuando la copia no está completa', () => {
  it('lo dice: es lo peor que esta pantalla podría callarse', async () => {
    // Quien exporta antes de borrar su cuenta no tiene forma de comprobarlo
    // por su cuenta. Entregarle una copia incompleta en silencio sería
    // dejarle perder cosas creyendo que las tiene.
    await escribirDiario();

    // Un registro cifrado con la clave de otro dominio: se comporta igual que
    // uno que este dispositivo no puede abrir.
    await sincronizacion.motor.registrarCambioLocal({
      id: 'memorial-ajeno',
      tipoEntidad: 'memorials',
      sobre: cifrar({
        contenido: JSON.stringify({ texto: 'algo' }),
        clave: claveDeDominio('diario'),
        claveHash: clavesDerivadas().claveHash,
        vinculo: { usuarioId: USUARIO, tipoEntidad: 'memorials', entidadId: 'memorial-ajeno' },
      }),
      metadatos: {},
    });

    montar();
    await generar();

    expect(await screen.findByText(/1 registro que este dispositivo no puede abrir/)).toBeTruthy();
  });

  it('y no lo dice cuando sí está completa', async () => {
    await escribirDiario();
    montar();

    await generar();

    expect(screen.queryByText(/no puede abrir/)).toBeNull();
  });
});

describe('compartir', () => {
  it('no se ofrece hasta que la copia existe', async () => {
    montar(() => undefined);

    expect(screen.queryByRole('button', { name: 'Guardar o compartir' })).toBeNull();
  });
});
