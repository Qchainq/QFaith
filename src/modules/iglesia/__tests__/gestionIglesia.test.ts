// Casos de uso de Iglesia.
//
// Lo que se comprueba aquí es lo que la batería SQL no puede ver: que el
// cliente sella el contenido antes de subirlo, que no degrada nunca a
// «subirlo sin cifrar», y que un permiso de mentor inventado no significa
// nada.
import {
  abrirSobreSellado,
  contextoDeComparticion,
  derivarParDeCompartir,
} from '@shared/services/crypto/comparticion';
import { generarClaveMaestra } from '@shared/services/crypto/servicioCriptografia';
import type {
  FilaComparticion,
  FilaMentoria,
  RepositorioIglesia,
} from '@shared/services/supabase/repositorioIglesia';

import {
  aMentoria,
  buscarIglesia,
  compartirPeticion,
  misIglesias,
} from '../use-cases/gestionIglesia';

const MARTA = 'usuario-marta';
const PETICION = 'peticion-1';

interface Subido {
  readonly cargaCifrada: string;
  readonly claveEnvuelta: string;
  readonly nonce: string;
  readonly destino: { readonly tipo: string; readonly id: string };
}

function repositorioFalso(subidos: Subido[], sobrescribir: Partial<RepositorioIglesia> = {}) {
  const base: RepositorioIglesia = {
    buscarPorCodigo: async () => null,
    misMembresias: async () => [],
    iglesiasPorId: async () => [],
    solicitarIngreso: async () => {
      throw new Error('no usado');
    },
    abandonar: async () => null,
    grupos: async () => [],
    eventos: async () => [],
    misInscripciones: async () => [],
    inscribirse: async () => null,
    anularInscripcion: async () => null,
    mentorias: async () => [],
    terminarMentoria: async () => null,
    compartir: async (parametros) => {
      subidos.push({
        cargaCifrada: parametros.cargaCifrada,
        claveEnvuelta: parametros.claveEnvuelta,
        nonce: parametros.nonce,
        destino: parametros.destino,
      });
      return {
        id: `share-${subidos.length}`,
        prayer_id: parametros.peticionId,
        owner_user_id: parametros.usuarioId,
        recipient_user_id: parametros.destino.id,
        group_id: null,
        church_id: null,
        encrypted_shared_payload: parametros.cargaCifrada,
        encrypted_content_key: parametros.claveEnvuelta,
        nonce: parametros.nonce,
        expires_at: null,
        revoked_at: null,
      } satisfies FilaComparticion;
    },
    comparticionesDe: async () => [],
    revocar: async () => null,
    recibidas: async () => [],
    ...sobrescribir,
  };
  return base;
}

const CONTENIDO = {
  titulo: 'Por la salud de mi hermana',
  detalle: 'Tengo miedo de lo que digan mañana.',
};

describe('compartir una petición', () => {
  it('el destinatario la abre y nadie más', async () => {
    const subidos: Subido[] = [];
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const pablo = derivarParDeCompartir(generarClaveMaestra());

    const resultado = await compartirPeticion(repositorioFalso(subidos), {
      usuarioId: MARTA,
      peticionId: PETICION,
      contenido: CONTENIDO,
      destinatarios: [{ usuarioId: 'elisa', publicaBase64: elisa.publicaBase64 }],
    });

    expect(resultado.compartidas).toHaveLength(1);

    const sobre = {
      efimeraPublicaBase64: subidos[0]!.claveEnvuelta,
      criptogramaBase64: subidos[0]!.cargaCifrada,
      nonceBase64: subidos[0]!.nonce,
    };
    const contexto = contextoDeComparticion({ peticionId: PETICION, propietarioId: MARTA });

    expect(
      JSON.parse(abrirSobreSellado({ privada: elisa.privada, sobre, datosAsociados: contexto })),
    ).toEqual(CONTENIDO);

    expect(() =>
      abrirSobreSellado({ privada: pablo.privada, sobre, datosAsociados: contexto }),
    ).toThrow();
  });

  it('lo que sube no contiene ni una palabra del texto', async () => {
    const subidos: Subido[] = [];
    const elisa = derivarParDeCompartir(generarClaveMaestra());

    await compartirPeticion(repositorioFalso(subidos), {
      usuarioId: MARTA,
      peticionId: PETICION,
      contenido: CONTENIDO,
      destinatarios: [{ usuarioId: 'elisa', publicaBase64: elisa.publicaBase64 }],
    });

    const crudo = JSON.stringify(subidos);
    expect(crudo).not.toContain('hermana');
    expect(crudo).not.toContain('miedo');
  });

  it('un sobre por persona, cada uno solo para el suyo', async () => {
    const subidos: Subido[] = [];
    const elisa = derivarParDeCompartir(generarClaveMaestra());
    const ana = derivarParDeCompartir(generarClaveMaestra());
    const contexto = contextoDeComparticion({ peticionId: PETICION, propietarioId: MARTA });

    await compartirPeticion(repositorioFalso(subidos), {
      usuarioId: MARTA,
      peticionId: PETICION,
      contenido: CONTENIDO,
      destinatarios: [
        { usuarioId: 'elisa', publicaBase64: elisa.publicaBase64 },
        { usuarioId: 'ana', publicaBase64: ana.publicaBase64 },
      ],
    });

    expect(subidos).toHaveLength(2);

    // El sobre de Ana no lo abre Elisa. Sin esto, una «clave de grupo» dejaría
    // a quien se marcha leyendo lo que se comparta después.
    const sobreDeAna = {
      efimeraPublicaBase64: subidos[1]!.claveEnvuelta,
      criptogramaBase64: subidos[1]!.cargaCifrada,
      nonceBase64: subidos[1]!.nonce,
    };
    expect(() =>
      abrirSobreSellado({ privada: elisa.privada, sobre: sobreDeAna, datosAsociados: contexto }),
    ).toThrow();
  });

  it('sin clave pública no se comparte con esa persona, y se dice', async () => {
    const subidos: Subido[] = [];
    const elisa = derivarParDeCompartir(generarClaveMaestra());

    const resultado = await compartirPeticion(repositorioFalso(subidos), {
      usuarioId: MARTA,
      peticionId: PETICION,
      contenido: CONTENIDO,
      destinatarios: [
        { usuarioId: 'elisa', publicaBase64: elisa.publicaBase64 },
        { usuarioId: 'sin-clave', publicaBase64: null },
      ],
    });

    // Nunca se degrada a subirlo sin cifrar: eso sería una fuga con forma de
    // compatibilidad.
    expect(subidos).toHaveLength(1);
    expect(resultado.sinClavePublica).toEqual(['sin-clave']);
  });

  it('compartir sin destinatarios se rechaza en vez de no hacer nada', async () => {
    await expect(
      compartirPeticion(repositorioFalso([]), {
        usuarioId: MARTA,
        peticionId: PETICION,
        contenido: CONTENIDO,
        destinatarios: [],
      }),
    ).rejects.toMatchObject({ claveMensaje: 'iglesia.errores.sinDestinatarios' });
  });
});

describe('permisos de mentor', () => {
  const fila = (permisos: Record<string, unknown>): FilaMentoria => ({
    id: 'm1',
    mentor_user_id: 'elisa',
    mentee_user_id: MARTA,
    status: 'active',
    permissions: permisos,
  });

  it('solo se reconocen los permisos del modelo', () => {
    expect(aMentoria(fila({ oracionesCompartidas: true })).permisos).toEqual([
      'oracionesCompartidas',
    ]);
  });

  it('un permiso inventado no significa nada', () => {
    // Alguien podría escribir «diario: true» en la base y creer que abre algo.
    // No abre nada: no existe política que lo permita, y el modelo ni lo lee.
    const mentoria = aMentoria(fila({ diario: true, todo: true, ia: true }));
    expect(mentoria.permisos).toEqual([]);
  });
});

describe('buscar una iglesia', () => {
  it('un código con forma incorrecta se rechaza antes de llegar al servidor', async () => {
    let consultado = false;
    const repositorio = repositorioFalso([], {
      buscarPorCodigo: async () => {
        consultado = true;
        return null;
      },
    });

    await expect(buscarIglesia(repositorio, 'Mi Iglesia!')).rejects.toMatchObject({
      claveMensaje: 'iglesia.errores.codigoInvalido',
    });
    expect(consultado).toBe(false);
  });

  it('se normaliza a minúsculas antes de consultar', async () => {
    let recibido: string | null = null;
    const repositorio = repositorioFalso([], {
      buscarPorCodigo: async (slug) => {
        recibido = slug;
        return null;
      },
    });

    await buscarIglesia(repositorio, '  MI-IGLESIA  ');
    expect(recibido).toBe('mi-iglesia');
  });
});

describe('mis iglesias', () => {
  it('las abandonadas no aparecen', async () => {
    const repositorio = repositorioFalso([], {
      misMembresias: async () => [
        {
          id: 'm1',
          church_id: 'c1',
          user_id: MARTA,
          role: 'member',
          membership_status: 'active',
          joined_at: null,
        },
        {
          id: 'm2',
          church_id: 'c2',
          user_id: MARTA,
          role: 'member',
          membership_status: 'left',
          joined_at: null,
        },
      ],
      iglesiasPorId: async () => [
        { id: 'c1', name: 'Una', slug: 'una', description: null, city: null, country_code: null },
        { id: 'c2', name: 'Otra', slug: 'otra', description: null, city: null, country_code: null },
      ],
    });

    const lista = await misIglesias(repositorio, MARTA);
    expect(lista.map((entrada) => entrada.iglesia.nombre)).toEqual(['Una']);
  });
});
