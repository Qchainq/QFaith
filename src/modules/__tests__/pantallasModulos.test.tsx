// Las cinco pestañas del Documento 10. En Fase 1 solo fijan la entrada de
// cada módulo, pero conviene comprobar que cada una monta, muestra su título
// traducido y no filtra texto sin traducir.
import { screen } from '@testing-library/react-native';

import { PantallaBiblia } from '@modules/biblia/screens/PantallaBiblia';
import { IaContenedor } from '@modules/ia/screens/IaContenedor';
import { PantallaInicio } from '@modules/inicio/screens/PantallaInicio';
import { PantallaOracion } from '@modules/oracion/screens/PantallaOracion';
import { PerfilContenedor } from '@modules/perfil/screens/PerfilContenedor';
import { ProveedorSincronizacion } from '@modules/sincronizacion/services/contextoSincronizacion';
import { crearAlmacenEnMemoria } from '@shared/database/almacenEnMemoria';
import { crearMotorSincronizacion } from '@shared/services/sync/motorSincronizacion';
import { crearServidorEnMemoria } from '@shared/services/sync/__tests__/servidorEnMemoria';
import { useEstadoSesion } from '@shared/state/estadoSesion';
import { renderizar, usarIdioma } from '@shared/testing/renderizar';

/**
 * Las pestañas que ya tienen módulo necesitan la sincronización montada. Se
 * inyecta una en memoria: aquí se comprueba que cada pantalla monta y se
 * traduce, no que la base local funcione, que tiene sus propias pruebas.
 */
function conSincronizacion(nodo: React.ReactElement) {
  const almacen = crearAlmacenEnMemoria();
  const sincronizacion = {
    almacen,
    usuarioId: 'usuario-1',
    motor: crearMotorSincronizacion({
      almacen,
      remoto: crearServidorEnMemoria(),
      usuarioId: 'usuario-1',
      dispositivoId: 'dispositivo-1',
    }),
  };
  return (
    <ProveedorSincronizacion
      usuarioId="usuario-1"
      dispositivoId="dispositivo-1"
      construir={async () => sincronizacion}
    >
      {nodo}
    </ProveedorSincronizacion>
  );
}

const PANTALLAS = [
  { Componente: PantallaInicio, titulo: 'Inicio', tituloEn: 'Home' },
  { Componente: PantallaBiblia, titulo: 'Biblia', tituloEn: 'Bible' },
  { Componente: PantallaOracion, titulo: 'Oración', tituloEn: 'Prayer' },
  // La pestaña se llama «IA», pero la cabecera de la pantalla dice
  // «Acompañante»: el nombre corto es para la barra, no para quien entra.
  { Componente: IaContenedor, titulo: 'Acompañante', tituloEn: 'Companion' },
  { Componente: PerfilContenedor, titulo: 'Perfil', tituloEn: 'Profile' },
] as const;

// El Perfil lee de quién es la cuenta antes de pintar nada, así que sin
// sesión abierta no monta. No es un apaño de la prueba: una pantalla de
// perfil sin saber a quién pertenece no tiene nada que enseñar.
beforeEach(() => {
  useEstadoSesion
    .getState()
    .abrirSesion({ id: 'usuario-1', correo: 'ana@ejemplo.invalid' }, 'dispositivo-1');
});

afterAll(async () => {
  useEstadoSesion.getState().cerrarSesion();
  await usarIdioma('es');
});

describe('pestañas principales', () => {
  // La sincronización se monta de forma asíncrona, así que se espera a que
  // cada pantalla aparezca en lugar de mirar el primer fotograma.
  it('cada una monta y muestra su título como cabecera', async () => {
    for (const { Componente, titulo } of PANTALLAS) {
      const { unmount } = renderizar(conSincronizacion(<Componente />));
      expect(await screen.findByRole('header', { name: titulo })).toBeTruthy();
      unmount();
    }
  });

  it('ninguna deja a la vista una clave de traducción sin resolver', async () => {
    for (const { Componente, titulo } of PANTALLAS) {
      const { unmount } = renderizar(conSincronizacion(<Componente />));
      await screen.findByRole('header', { name: titulo });
      // Una clave sin traducir se vería tal cual, con su punto separador. Se
      // busca entre el texto visible en lugar de serializar el árbol: el árbol
      // incluye ahora el proveedor, que tiene referencias circulares.
      expect(screen.queryByText(/^(navegacion|vacios|comun|oracion|ia|perfil)\.\w+/)).toBeNull();
      unmount();
    }
  });

  it('se traducen al cambiar de idioma', async () => {
    await usarIdioma('en');

    for (const { Componente, tituloEn } of PANTALLAS) {
      const { unmount } = renderizar(conSincronizacion(<Componente />));
      expect(await screen.findByRole('header', { name: tituloEn })).toBeTruthy();
      unmount();
    }
  });
});
