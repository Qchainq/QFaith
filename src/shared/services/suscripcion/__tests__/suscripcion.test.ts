// La capa de suscripción en el cliente.
//
// Lo que se vigila aquí no es que el acceso se conceda bien —eso lo decide la
// base de datos y lo comprueba la batería 08— sino tres cosas que sí son de
// este lado:
//
//   1. Que el cliente **solo lea**: aquí no hay ninguna función que escriba.
//   2. Que lo que la pantalla dice coincida con lo que el servidor hará.
//   3. Que caducar no bloquee nada de lo que ya es suyo.
import { crearClienteRest } from '@shared/services/supabase/rest';

import { mensajeDeAcceso, pareceConAcceso, SIEMPRE_DISPONIBLE } from '../estadoDeAcceso';
import { pagosNoDisponibles } from '../puertoPagos';
import { crearRepositorioSuscripcion, type Suscripcion } from '../repositorioSuscripcion';

const AHORA = new Date('2026-08-04T10:00:00.000Z');
const EN_UN_MES = '2026-09-04T10:00:00.000Z';
const HACE_UN_MES = '2026-07-04T10:00:00.000Z';

const suscripcion = (extra: Partial<Suscripcion>): Suscripcion => ({
  plan: 'anual',
  estado: 'active',
  renuevaEn: EN_UN_MES,
  terminaAlAcabarElPeriodo: false,
  enGraciaHasta: null,
  ...extra,
});

function montar(respuestas: { estado: number; cuerpo: unknown }[] = []) {
  const peticiones: { url: string; metodo: string }[] = [];

  const transporte = (async (url: string | URL | Request, init?: RequestInit) => {
    peticiones.push({ url: decodeURIComponent(String(url)), metodo: init?.method ?? 'GET' });
    const siguiente = respuestas.shift() ?? { estado: 200, cuerpo: [] };
    return {
      status: siguiente.estado,
      text: async () => JSON.stringify(siguiente.cuerpo),
    } as Response;
  }) as typeof fetch;

  const rest = crearClienteRest({
    transporte,
    proveerToken: async () => 'token-de-prueba',
    url: 'https://ejemplo.supabase.co',
    claveAnonima: 'anonima',
  });

  return { peticiones, repositorio: crearRepositorioSuscripcion(rest) };
}

describe('el cliente solo lee', () => {
  it('el repositorio no expone ninguna forma de escribir', () => {
    // Si pudiera escribir, cualquiera se concedería acceso de pago con una
    // petición. El privilegio está revocado en la base y aquí no hay puerta.
    const { repositorio } = montar();

    expect(Object.keys(repositorio)).toEqual(['actual']);
  });

  it('solo hace peticiones de lectura', async () => {
    const { repositorio, peticiones } = montar();

    await repositorio.actual();

    expect(peticiones[0]?.metodo).toBe('GET');
  });

  it('no filtra por usuario: eso lo hace la política', async () => {
    // Filtrarlo aquí daría a entender que el cliente decide cuál es la suya.
    const { repositorio, peticiones } = montar();

    await repositorio.actual();

    expect(peticiones[0]?.url).not.toContain('user_id=eq.');
    expect(peticiones[0]?.url).toContain('order=created_at.desc');
  });
});

describe('leer el estado', () => {
  it('sin suscripción devuelve null, no una inventada', async () => {
    const { repositorio } = montar([{ estado: 200, cuerpo: [] }]);

    expect(await repositorio.actual()).toBeNull();
  });

  it('una caducada se enseña, no se esconde', async () => {
    // Quien acaba de dejar de pagar tiene derecho a ver que figura como
    // caducada, en vez de una pantalla que dice que nunca pagó.
    const { repositorio } = montar([
      {
        estado: 200,
        cuerpo: [
          {
            plan_code: 'anual',
            status: 'expired',
            current_period_end: HACE_UN_MES,
            grace_until: null,
            cancel_at_period_end: false,
          },
        ],
      },
    ]);

    expect(await repositorio.actual()).toMatchObject({ estado: 'expired', plan: 'anual' });
  });

  it('un estado desconocido se trata como caducado, nunca como activo', async () => {
    // Ante la duda no se promete acceso: la pantalla no debe ofrecer algo que
    // el servidor luego niegue.
    const { repositorio } = montar([
      {
        estado: 200,
        cuerpo: [
          {
            plan_code: 'anual',
            status: 'lo-que-sea',
            current_period_end: EN_UN_MES,
            grace_until: null,
            cancel_at_period_end: false,
          },
        ],
      },
    ]);

    expect((await repositorio.actual())?.estado).toBe('expired');
  });

  it('un error del servidor no se convierte en «sin suscripción»', async () => {
    // Eso le diría a alguien que paga que no paga.
    const { repositorio } = montar([{ estado: 500, cuerpo: { code: 'PGRST000' } }]);

    await expect(repositorio.actual()).rejects.toMatchObject({ name: 'ErrorApp' });
  });
});

describe('lo que la pantalla enseña coincide con lo que hará el servidor', () => {
  // Las mismas reglas que aplica `fn_tiene_acceso_premium`. Si se separaran,
  // la persona vería una cosa y el servidor haría otra.
  it.each([
    ['sin suscripción', null, false],
    ['activa con periodo por delante', suscripcion({}), true],
    ['activa con el periodo vencido', suscripcion({ renuevaEn: HACE_UN_MES }), false],
    ['en prueba', suscripcion({ estado: 'trialing' }), true],
    [
      'en gracia dentro del plazo',
      suscripcion({ estado: 'grace', enGraciaHasta: EN_UN_MES }),
      true,
    ],
    ['en gracia agotada', suscripcion({ estado: 'grace', enGraciaHasta: HACE_UN_MES }), false],
    ['cancelada con periodo pagado por delante', suscripcion({ estado: 'canceled' }), true],
    [
      'cancelada con el periodo agotado',
      suscripcion({ estado: 'canceled', renuevaEn: HACE_UN_MES }),
      false,
    ],
    ['caducada', suscripcion({ estado: 'expired', renuevaEn: HACE_UN_MES }), false],
  ])('%s → %s', (_caso, entrada, esperado) => {
    expect(pareceConAcceso(entrada, AHORA)).toBe(esperado);
  });

  it('caducada con periodo por delante tampoco da acceso', () => {
    // Es lo que deja un reembolso: el proveedor caduca la suscripción de
    // inmediato aunque el periodo pagado no hubiera terminado. Mirar solo la
    // fecha daría acceso a alguien a quien ya se le devolvió el dinero.
    expect(pareceConAcceso(suscripcion({ estado: 'expired', renuevaEn: EN_UN_MES }), AHORA)).toBe(
      false,
    );
  });

  it('gracia sin fecha no da acceso', () => {
    // El esquema lo prohíbe, pero si una fila antigua llegara así, no se
    // concede: ante la duda, no.
    expect(pareceConAcceso(suscripcion({ estado: 'grace', enGraciaHasta: null }), AHORA)).toBe(
      false,
    );
  });
});

describe('cómo se cuenta', () => {
  it.each([
    ['sin suscripción', null, 'suscripcion.estado.sinSuscripcion'],
    ['activa', suscripcion({}), 'suscripcion.estado.activa'],
    ['en prueba', suscripcion({ estado: 'trialing' }), 'suscripcion.estado.prueba'],
    [
      'en gracia',
      suscripcion({ estado: 'grace', enGraciaHasta: EN_UN_MES }),
      'suscripcion.estado.gracia',
    ],
    [
      'cancelada pero vigente',
      suscripcion({ estado: 'canceled' }),
      'suscripcion.estado.terminaPronto',
    ],
    [
      'activa marcada para no renovar',
      suscripcion({ terminaAlAcabarElPeriodo: true }),
      'suscripcion.estado.terminaPronto',
    ],
    [
      'caducada',
      suscripcion({ estado: 'expired', renuevaEn: HACE_UN_MES }),
      'suscripcion.estado.caducada',
    ],
  ])('%s', (_caso, entrada, esperado) => {
    expect(mensajeDeAcceso(entrada, AHORA)).toBe(esperado);
  });

  it('siempre devuelve claves de i18n, nunca texto', () => {
    expect(mensajeDeAcceso(null).startsWith('suscripcion.')).toBe(true);
  });
});

describe('lo que no depende de haber pagado', () => {
  it('están las cuatro cosas que el Documento 14 protege', () => {
    // No bloquear la recuperación de datos por falta de suscripción, ni
    // eliminar contenido privado al expirar. Se comprueba la lista para que no
    // se encoja sin que nadie lo note.
    expect(SIEMPRE_DISPONIBLE).toContain('exportar el contenido');
    expect(SIEMPRE_DISPONIBLE).toContain('restaurar la cuenta con la frase');
    expect(SIEMPRE_DISPONIBLE).toContain('leer lo ya escrito');
    expect(SIEMPRE_DISPONIBLE).toContain('sincronizar entre dispositivos');
  });
});

describe('mientras no haya proveedor de pago', () => {
  it('no hay nada que comprar, y preguntarlo no rompe la pantalla', async () => {
    expect(await pagosNoDisponibles.productos()).toEqual([]);
  });

  it('comprar no devuelve un recibo falso', async () => {
    // Devolverlo aquí abriría el contenido de pago a todo el mundo mientras
    // dure el andamio.
    expect(await pagosNoDisponibles.comprar('anual')).toBeNull();
  });

  it('restaurar tampoco inventa compras anteriores', async () => {
    expect(await pagosNoDisponibles.restaurar()).toEqual([]);
  });
});
