// Archivos privados de punta a punta: hooks, cifrado, almacén y cubo reales.
//
// Las pruebas del repositorio comprueban las reglas; estas comprueban que el
// camino que recorre una pantalla de verdad funciona —adjuntar, ver la lista,
// abrir, quitar— y que lo que aparece delante de la persona dice la verdad
// sobre dónde está su archivo.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { crearSincronizacionDePrueba } from '@modules/sincronizacion/__tests__/sincronizacionDePrueba';
import {
  ProveedorSincronizacion,
  type Sincronizacion,
} from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import {
  bloquear,
  inicializarCuenta,
  olvidarDispositivo,
} from '@shared/services/keys/servicioClaves';
import {
  crearServidorEnMemoria,
  type ServidorEnMemoria,
} from '@shared/services/sync/__tests__/servidorEnMemoria';
import { Texto } from '@shared/components/Texto';
import { renderizar } from '@shared/testing/renderizar';

import { ListaAdjuntos } from '../components/ListaAdjuntos';
import { useAbrirArchivo, useAdjuntar, useAdjuntos, useRetirarAdjunto } from '../hooks/useArchivos';

const USUARIO = 'usuario-1';
const MEMORIAL = 'memorial-1';
const SECRETO = 'La última carta que me escribió mi padre.';
const KDF_RAPIDO = {
  algoritmo: 'argon2id',
  memoriaKiB: 256,
  iteraciones: 1,
  paralelismo: 1,
} as const;

let servidor: ServidorEnMemoria;
let sincronizacion: Sincronizacion;

beforeEach(async () => {
  bloquear();
  await olvidarDispositivo();
  await inicializarCuenta({ usuarioId: USUARIO, ajustesKdf: KDF_RAPIDO });

  servidor = crearServidorEnMemoria();
  sincronizacion = crearSincronizacionDePrueba({
    almacen: crearAlmacenEnMemoria(),
    usuarioId: USUARIO,
    remoto: servidor,
  });
});

/**
 * Pantalla mínima que usa los hooks igual que lo haría un memorial.
 *
 * Se escribe aquí y no se toma prestada de otro módulo para que estas pruebas
 * fallen por lo suyo: si mañana el memorial cambia de sitio los adjuntos,
 * esto sigue midiendo el módulo de archivos.
 */
function PantallaConAdjuntos() {
  const adjuntos = useAdjuntos('memorial', MEMORIAL);
  const adjuntar = useAdjuntar('memorial', MEMORIAL);
  const retirar = useRetirarAdjunto('memorial', MEMORIAL);
  const abrir = useAbrirArchivo();
  const [abierto, setAbierto] = useState('');

  return (
    <>
      <ListaAdjuntos
        adjuntos={adjuntos.data ?? []}
        abriendo={abrir.isPending}
        alAnadir={() => {
          void adjuntar.mutateAsync({
            origen: 'memorial',
            origenId: MEMORIAL,
            tipo: 'application/pdf',
            nombre: 'carta-de-mi-padre.pdf',
            contenido: new TextEncoder().encode(SECRETO),
          });
        }}
        alAbrir={(id) => {
          void abrir.mutateAsync(id).then((bytes) => {
            setAbierto(new TextDecoder().decode(bytes));
          });
        }}
        alRetirar={(id) => {
          void retirar.mutateAsync(id);
        }}
      />
      {abierto.length > 0 && <Texto>{abierto}</Texto>}
    </>
  );
}

const montar = () =>
  renderizar(
    <ProveedorSincronizacion
      usuarioId={USUARIO}
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
      sincronizarEnSegundoPlano={false}
    >
      <PantallaConAdjuntos />
    </ProveedorSincronizacion>,
  );

describe('adjuntar', () => {
  it('parte de un estado vacío que no culpa a nadie', async () => {
    montar();

    expect(await screen.findByText('Todavía no has adjuntado nada.')).toBeTruthy();
  });

  it('dice que se cifra antes de salir', async () => {
    // Quien va a subir la foto de alguien que murió merece saberlo antes de
    // decidirse, no después.
    montar();

    expect(
      await screen.findByText('Se cifra en tu teléfono antes de salir. Nadie más puede abrirlo.'),
    ).toBeTruthy();
  });

  it('el archivo aparece en la lista con su nombre', async () => {
    montar();

    const botonAadirunarchivo = await screen.findByText('Añadir un archivo');
    await act(async () => {
      fireEvent.press(botonAadirunarchivo);
    });

    expect(await screen.findByText('carta-de-mi-padre.pdf')).toBeTruthy();
  });

  it('mientras no ha subido lo dice sin alarmar', async () => {
    montar();

    const botonAadirunarchivo = await screen.findByText('Añadir un archivo');
    await act(async () => {
      fireEvent.press(botonAadirunarchivo);
    });

    // Es cómo funciona la aplicación, no un error: nada de rojo ni de
    // «fallo». El archivo está a salvo en el teléfono.
    expect(await screen.findByText(/Se subirá cuando haya conexión/)).toBeTruthy();
  });

  it('el contenido nunca llega al servidor en claro', async () => {
    montar();

    const botonAadirunarchivo = await screen.findByText('Añadir un archivo');
    await act(async () => {
      fireEvent.press(botonAadirunarchivo);
    });
    await screen.findByText('carta-de-mi-padre.pdf');

    await act(async () => {
      await sincronizacion.motor.sincronizar();
    });

    // Todo lo que el servidor ha recibido, junto.
    const enElServidor = JSON.stringify(servidor.filas());
    expect(enElServidor).not.toContain(SECRETO);
    expect(enElServidor).not.toContain('carta-de-mi-padre');
  });
});

describe('abrir', () => {
  it('devuelve el contenido descifrado', async () => {
    montar();

    const botonAadirunarchivo = await screen.findByText('Añadir un archivo');
    await act(async () => {
      fireEvent.press(botonAadirunarchivo);
    });
    const botonAbrir = await screen.findByText('Abrir');
    await act(async () => {
      fireEvent.press(botonAbrir);
    });

    expect(await screen.findByText(SECRETO)).toBeTruthy();
  });
});

describe('quitar', () => {
  it('desaparece de la lista y vuelve el estado vacío', async () => {
    montar();

    const botonAadirunarchivo = await screen.findByText('Añadir un archivo');
    await act(async () => {
      fireEvent.press(botonAadirunarchivo);
    });
    const botonQuitar = await screen.findByText('Quitar');
    await act(async () => {
      fireEvent.press(botonQuitar);
    });

    await waitFor(async () => {
      expect(await screen.findByText('Todavía no has adjuntado nada.')).toBeTruthy();
    });
  });
});
