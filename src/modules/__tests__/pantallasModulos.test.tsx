// Las cinco pestañas del Documento 10. En Fase 1 solo fijan la entrada de
// cada módulo, pero conviene comprobar que cada una monta, muestra su título
// traducido y no filtra texto sin traducir.
import { screen } from '@testing-library/react-native';

import { PantallaBiblia } from '@modules/biblia/screens/PantallaBiblia';
import { PantallaIa } from '@modules/ia/screens/PantallaIa';
import { PantallaInicio } from '@modules/inicio/screens/PantallaInicio';
import { PantallaOracion } from '@modules/oracion/screens/PantallaOracion';
import { PantallaPerfil } from '@modules/perfil/screens/PantallaPerfil';
import { renderizar, usarIdioma } from '@shared/testing/renderizar';

const PANTALLAS = [
  { Componente: PantallaInicio, titulo: 'Inicio', tituloEn: 'Home' },
  { Componente: PantallaBiblia, titulo: 'Biblia', tituloEn: 'Bible' },
  { Componente: PantallaOracion, titulo: 'Oración', tituloEn: 'Prayer' },
  { Componente: PantallaIa, titulo: 'IA', tituloEn: 'AI' },
  { Componente: PantallaPerfil, titulo: 'Perfil', tituloEn: 'Profile' },
] as const;

afterAll(async () => {
  await usarIdioma('es');
});

describe('pestañas principales', () => {
  it('cada una monta y muestra su título como cabecera', () => {
    PANTALLAS.forEach(({ Componente, titulo }) => {
      const { unmount } = renderizar(<Componente />);
      expect(screen.getByRole('header', { name: titulo })).toBeTruthy();
      unmount();
    });
  });

  it('ninguna deja a la vista una clave de traducción sin resolver', () => {
    PANTALLAS.forEach(({ Componente }) => {
      const { unmount, toJSON } = renderizar(<Componente />);
      // Una clave sin traducir aparecería tal cual, con su punto separador.
      expect(JSON.stringify(toJSON())).not.toMatch(/"(navegacion|vacios|comun)\.\w+"/);
      unmount();
    });
  });

  it('se traducen al cambiar de idioma', async () => {
    await usarIdioma('en');

    PANTALLAS.forEach(({ Componente, tituloEn }) => {
      const { unmount } = renderizar(<Componente />);
      expect(screen.getByRole('header', { name: tituloEn })).toBeTruthy();
      unmount();
    });
  });
});
