// Esqueleto de navegación: cinco pestañas inferiores con barra de cristal.
// Las pantallas de cada módulo se desarrollan en la Fase 2; aquí queda
// establecida la estructura que deben respetar.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { PantallaBiblia } from '@modules/biblia/screens/PantallaBiblia';
import { PantallaIa } from '@modules/ia/screens/PantallaIa';
import { PantallaInicio } from '@modules/inicio/screens/PantallaInicio';
import { PantallaOracion } from '@modules/oracion/screens/PantallaOracion';
import { PantallaPerfil } from '@modules/perfil/screens/PantallaPerfil';
import { useTema } from '@shared/theme/ProveedorTema';
import type { PestanasParamList } from '@shared/navigation/tipos';

const Pestanas = createBottomTabNavigator<PestanasParamList>();

export function NavegacionRaiz() {
  const tema = useTema();
  const { t } = useTranslation();

  const temaNavegacion = {
    ...(tema.esOscuro ? DarkTheme : DefaultTheme),
    colors: {
      ...(tema.esOscuro ? DarkTheme : DefaultTheme).colors,
      background: tema.colores.fondo,
      card: tema.colores.fondoElevado,
      text: tema.colores.textoPrincipal,
      primary: tema.colores.acento,
      border: tema.colores.separador,
    },
  };

  return (
    <NavigationContainer theme={temaNavegacion}>
      <Pestanas.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tema.colores.acento,
          tabBarInactiveTintColor: tema.colores.textoTenue,
          tabBarStyle: [
            styles.barra,
            {
              backgroundColor: tema.colores.cristal,
              borderTopColor: tema.colores.cristalBorde,
            },
          ],
        }}
      >
        <Pestanas.Screen
          name="Inicio"
          component={PantallaInicio}
          options={{ title: t('navegacion.inicio') }}
        />
        <Pestanas.Screen
          name="Biblia"
          component={PantallaBiblia}
          options={{ title: t('navegacion.biblia') }}
        />
        <Pestanas.Screen
          name="Oracion"
          component={PantallaOracion}
          options={{ title: t('navegacion.oracion') }}
        />
        <Pestanas.Screen name="IA" component={PantallaIa} options={{ title: t('navegacion.ia') }} />
        <Pestanas.Screen
          name="Perfil"
          component={PantallaPerfil}
          options={{ title: t('navegacion.perfil') }}
        />
      </Pestanas.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  barra: {
    position: 'absolute',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
