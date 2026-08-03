// Esqueleto de navegación: cinco pestañas inferiores con barra de cristal.
// Las pantallas de cada módulo se desarrollan en la Fase 2; aquí queda
// establecida la estructura que deben respetar.
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { PantallaBiblia } from '@modules/biblia/screens/PantallaBiblia';
import { DiarioContenedor } from '@modules/diario/screens/DiarioContenedor';
import { BibliotecaContenedor } from '@modules/biblioteca-vida/screens/BibliotecaContenedor';
import { HabitosContenedor } from '@modules/habitos/screens/HabitosContenedor';
import { IaContenedor } from '@modules/ia/screens/IaContenedor';
import { IglesiaContenedor } from '@modules/iglesia/screens/IglesiaContenedor';
import { PantallaInicio } from '@modules/inicio/screens/PantallaInicio';
import { MemorialContenedor } from '@modules/memorial/screens/MemorialContenedor';
import { PantallaOracion } from '@modules/oracion/screens/PantallaOracion';
import { PerfilContenedor } from '@modules/perfil/screens/PerfilContenedor';
import { SermonesContenedor } from '@modules/sermones/screens/SermonesContenedor';
import { useTema } from '@shared/theme/ProveedorTema';
import type { InicioParamList, PestanasParamList } from '@shared/navigation/tipos';

const Pestanas = createBottomTabNavigator<PestanasParamList>();
const PilaInicio = createNativeStackNavigator<InicioParamList>();

/**
 * Pila de la pestaña Inicio. Los módulos secundarios cuelgan de aquí, nunca a
 * más de tres niveles de profundidad (Documento 10).
 */
function NavegacionInicio() {
  const { t } = useTranslation();
  return (
    <PilaInicio.Navigator>
      <PilaInicio.Screen name="Portada" options={{ headerShown: false }}>
        {({ navigation }) => (
          <PantallaInicio
            alAbrirDiario={() => navigation.navigate('Diario')}
            alAbrirHabitos={() => navigation.navigate('Habitos')}
            alAbrirBiblioteca={() => navigation.navigate('Biblioteca')}
            alAbrirMemorial={() => navigation.navigate('Memorial')}
            alAbrirIglesia={() => navigation.navigate('Iglesia')}
            alAbrirSermones={() => navigation.navigate('Sermones')}
          />
        )}
      </PilaInicio.Screen>
      <PilaInicio.Screen
        name="Diario"
        component={DiarioContenedor}
        options={{ title: t('diario.titulo'), headerShown: false }}
      />
      <PilaInicio.Screen
        name="Habitos"
        component={HabitosContenedor}
        options={{ title: t('habitos.titulo'), headerShown: false }}
      />
      <PilaInicio.Screen
        name="Biblioteca"
        component={BibliotecaContenedor}
        options={{ title: t('biblioteca.titulo'), headerShown: false }}
      />
      <PilaInicio.Screen
        name="Memorial"
        component={MemorialContenedor}
        options={{ title: t('memorial.titulo'), headerShown: false }}
      />
      <PilaInicio.Screen
        name="Iglesia"
        component={IglesiaContenedor}
        options={{ title: t('iglesia.titulo'), headerShown: false }}
      />
      <PilaInicio.Screen
        name="Sermones"
        component={SermonesContenedor}
        options={{ title: t('sermones.titulo'), headerShown: false }}
      />
    </PilaInicio.Navigator>
  );
}

export interface PropsNavegacionRaiz {
  /** Cerrar sesión vive en el arranque: es quien descarta las claves. */
  readonly alCerrarSesion?: () => void;
}

export function NavegacionRaiz({ alCerrarSesion }: PropsNavegacionRaiz = {}) {
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
          component={NavegacionInicio}
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
        <Pestanas.Screen
          name="IA"
          component={IaContenedor}
          options={{ title: t('navegacion.ia'), headerShown: false }}
        />
        <Pestanas.Screen name="Perfil" options={{ title: t('navegacion.perfil') }}>
          {() => <PerfilContenedor {...(alCerrarSesion === undefined ? {} : { alCerrarSesion })} />}
        </Pestanas.Screen>
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
