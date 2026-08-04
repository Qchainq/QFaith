// La pantalla de suscripción.
//
// Lo que se vigila aquí es el tono. Es la pantalla donde más fácil resulta
// apretar —urgencia, culpa, letra pequeña— y donde peor sienta: alguien que
// está decidiendo si paga por acompañamiento espiritual no debería sentirse
// empujado.
import { act, fireEvent, screen } from '@testing-library/react-native';

import type { ProductoTienda, PuertoPagos } from '@shared/services/suscripcion/puertoPagos';
import type {
  RepositorioSuscripcion,
  Suscripcion,
} from '@shared/services/suscripcion/repositorioSuscripcion';
import { renderizar } from '@shared/testing/renderizar';

import { SuscripcionContenedor } from '../screens/SuscripcionContenedor';

const EN_UN_MES = '2099-09-04T10:00:00.000Z';

const repositorioCon = (suscripcion: Suscripcion | null): RepositorioSuscripcion => ({
  actual: async () => suscripcion,
});

/** Tienda con lo que se le diga, y que nunca concede acceso por sí sola. */
const tiendaCon = (productos: readonly ProductoTienda[]): PuertoPagos => ({
  productos: async () => productos,
  comprar: async () => null,
  restaurar: async () => [],
});

const PRODUCTO: ProductoTienda = {
  id: 'anual',
  precio: '29,99 €',
  periodicidad: 'anual',
  diasDePrueba: 7,
};

const montar = (opciones: { suscripcion?: Suscripcion | null; pagos?: PuertoPagos } = {}) =>
  renderizar(
    <SuscripcionContenedor
      repositorio={repositorioCon(opciones.suscripcion ?? null)}
      {...(opciones.pagos === undefined ? {} : { pagos: opciones.pagos })}
    />,
  );

describe('el tono', () => {
  it('lo primero que dice es que la aplicación funciona sin pagar', async () => {
    montar();

    expect(await screen.findByText(/funciona sin pagar nada/)).toBeTruthy();
    expect(screen.getByText(/no desbloquea tu vida/)).toBeTruthy();
  });

  it('dice que el contenido sigue siendo suyo pase lo que pase', async () => {
    // Y lo dice siempre, también estando suscrito: es lo que quita el miedo.
    montar({
      suscripcion: {
        plan: 'anual',
        estado: 'active',
        renuevaEn: EN_UN_MES,
        terminaAlAcabarElPeriodo: false,
        enGraciaHasta: null,
      },
    });

    expect(await screen.findByText(/tu contenido sigue siendo tuyo/)).toBeTruthy();
  });

  it('un pago rechazado se cuenta sin amenazar', async () => {
    montar({
      suscripcion: {
        plan: 'anual',
        estado: 'grace',
        renuevaEn: null,
        terminaAlAcabarElPeriodo: false,
        enGraciaHasta: EN_UN_MES,
      },
    });

    // «Sigues teniendo acceso mientras lo resuelves» es literal: el periodo de
    // gracia existe en el esquema.
    expect(await screen.findByText(/Sigues teniendo acceso mientras lo resuelves/)).toBeTruthy();
  });

  it('no mete prisa ni culpa', async () => {
    montar({ pagos: tiendaCon([PRODUCTO]) });
    await screen.findByText(/funciona sin pagar nada/);

    const texto = JSON.stringify(screen.toJSON()).toLowerCase();
    for (const prohibido of [
      'última oportunidad',
      'no pierdas',
      'solo hoy',
      'te quedan',
      'urgente',
    ]) {
      expect(texto).not.toContain(prohibido);
    }
  });
});

describe('sin proveedor de pago', () => {
  it('lo dice en vez de enseñar un botón que no hace nada', async () => {
    montar();

    expect(await screen.findByText('Todavía no se puede suscribir desde aquí.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Suscribirme' })).toBeNull();
  });

  it('restaurar compras sigue estando a la vista', async () => {
    // Cambiar de teléfono no puede obligar a pagar dos veces, y esconderlo lo
    // haría en la práctica.
    montar();

    expect(await screen.findByRole('button', { name: 'Ya pagué en otro teléfono' })).toBeTruthy();
  });
});

describe('con productos en la tienda', () => {
  it('el precio se enseña tal y como lo da la tienda', async () => {
    // No se formatea aquí: la tienda ya lo da en la moneda de la persona, y
    // reformatearlo produciría un número distinto al del diálogo de compra.
    montar({ pagos: tiendaCon([PRODUCTO]) });

    expect(await screen.findByText('29,99 € al año')).toBeTruthy();
    expect(screen.getByText('7 días de prueba')).toBeTruthy();
  });

  it('comprar no concede acceso por sí solo', async () => {
    // El recibo lo valida el servidor. Entre pulsar y tener acceso hay una
    // validación que esta pantalla no puede saltarse.
    const pagos = tiendaCon([PRODUCTO]);
    montar({ pagos });

    const boton = await screen.findByRole('button', { name: 'Suscribirme' });
    await act(async () => {
      fireEvent.press(boton);
    });

    // El repositorio sigue diciendo que no hay suscripción, y la pantalla lo
    // respeta en vez de adelantarse.
    expect(await screen.findByText('No tienes suscripción.')).toBeTruthy();
  });
});

describe('el estado de la suscripción', () => {
  it('una activa dice cuándo se renueva', async () => {
    montar({
      suscripcion: {
        plan: 'anual',
        estado: 'active',
        renuevaEn: EN_UN_MES,
        terminaAlAcabarElPeriodo: false,
        enGraciaHasta: null,
      },
    });

    expect(await screen.findByText('Tu suscripción está activa.')).toBeTruthy();
    expect(screen.getByText(/Se renueva el 2099-09-04/)).toBeTruthy();
  });

  it('una cancelada dice cuándo termina, no cuándo se renueva', async () => {
    // Decir «se renueva» de algo que no se va a renovar sería mentir.
    montar({
      suscripcion: {
        plan: 'anual',
        estado: 'canceled',
        renuevaEn: EN_UN_MES,
        terminaAlAcabarElPeriodo: true,
        enGraciaHasta: null,
      },
    });

    expect(await screen.findByText(/Termina el 2099-09-04/)).toBeTruthy();
    expect(screen.queryByText(/Se renueva/)).toBeNull();
  });

  it('sin suscripción no inventa fechas', async () => {
    montar();

    expect(await screen.findByText('No tienes suscripción.')).toBeTruthy();
    expect(screen.queryByText(/Se renueva/)).toBeNull();
    expect(screen.queryByText(/Termina el/)).toBeNull();
  });
});
