// El detector de accesibilidad.
//
// Existe porque el barrido de pantallas comprueba listas de incumplimientos, y
// una lista vacía es indistinguible de un detector roto. Aquí se comprueba el
// detector contra casos que sí incumplen: si dejara de reconocerlos, estas
// pruebas caen antes que las sesenta de allí.
import { Pressable, Text, View } from 'react-native';
import { screen } from '@testing-library/react-native';

import { renderizar } from '@shared/testing/renderizar';

import { demasiadoPequenos, interactivosDe, sinNombre, sinRol } from '../accesibilidad';

const analizar = (nodo: React.ReactElement) => {
  renderizar(nodo);
  return interactivosDe(screen.UNSAFE_root);
};

describe('qué cuenta como interactivo', () => {
  it('un pulsable accesible cuenta', () => {
    expect(
      analizar(
        <Pressable accessible accessibilityRole="button" onPress={() => undefined}>
          <Text>Guardar</Text>
        </Pressable>,
      ),
    ).toHaveLength(1);
  });

  it('una vista sin `onPress` no cuenta', () => {
    // Si contara, el barrido acusaría de inaccesible a cada contenedor.
    expect(analizar(<View accessibilityRole="button" />)).toHaveLength(0);
  });
});

describe('nombre para el lector de pantalla', () => {
  it('un botón sin etiqueta pero con texto sí tiene nombre', () => {
    // VoiceOver lee el texto de dentro. Exigir `accessibilityLabel` cuando ya
    // hay texto visible sería pedir que se escriba dos veces lo mismo, y las
    // dos copias acabarían diciendo cosas distintas.
    const elementos = analizar(
      <Pressable accessible accessibilityRole="button" onPress={() => undefined}>
        <Text>Guardar</Text>
      </Pressable>,
    );

    expect(sinNombre(elementos)).toHaveLength(0);
    expect(elementos[0]?.nombre).toBe('Guardar');
  });

  it('la etiqueta explícita manda sobre el texto', () => {
    const elementos = analizar(
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel="Quitar el subrayado del versículo 3"
        onPress={() => undefined}
      >
        <Text>×</Text>
      </Pressable>,
    );

    // Un botón cuyo texto es «×» necesita que alguien escriba qué hace.
    expect(elementos[0]?.nombre).toBe('Quitar el subrayado del versículo 3');
  });

  it('un botón solo con icono y sin etiqueta se señala como anónimo', () => {
    // Es el caso que de verdad rompe una pantalla para quien no la ve: el
    // lector anuncia «botón» y nada más.
    const elementos = analizar(
      <Pressable accessible accessibilityRole="button" onPress={() => undefined}>
        <View />
      </Pressable>,
    );

    expect(sinNombre(elementos)).toHaveLength(1);
  });
});

describe('papel declarado', () => {
  it('sin papel se señala', () => {
    // Sin él, quien navega por gestos se lo salta: el lector no dice que sea
    // pulsable.
    expect(
      sinRol(
        analizar(
          <Pressable accessible onPress={() => undefined}>
            <Text>Guardar</Text>
          </Pressable>,
        ),
      ),
    ).toHaveLength(1);
  });

  it('con papel no se señala', () => {
    expect(
      sinRol(
        analizar(
          <Pressable accessible accessibilityRole="button" onPress={() => undefined}>
            <Text>Guardar</Text>
          </Pressable>,
        ),
      ),
    ).toHaveLength(0);
  });
});

describe('área táctil', () => {
  it('una altura por debajo de 44 se señala', () => {
    expect(
      demasiadoPequenos(
        analizar(
          <Pressable
            accessible
            accessibilityRole="button"
            style={{ minHeight: 30 }}
            onPress={() => undefined}
          >
            <Text>Quitar</Text>
          </Pressable>,
        ),
      ),
    ).toHaveLength(1);
  });

  it('exactamente 44 vale', () => {
    // Un `>` en vez de un `>=` dejaría fuera el tamaño que las guías admiten.
    expect(
      demasiadoPequenos(
        analizar(
          <Pressable
            accessible
            accessibilityRole="button"
            style={{ minHeight: 44 }}
            onPress={() => undefined}
          >
            <Text>Quitar</Text>
          </Pressable>,
        ),
      ),
    ).toHaveLength(0);
  });

  it('sin altura declarada no se señala: la da el contenido', () => {
    // No se puede medir sin un dispositivo. Declarar una menor sí es una
    // decisión explícita y equivocada; no declarar ninguna, no.
    expect(
      demasiadoPequenos(
        analizar(
          <Pressable accessible accessibilityRole="button" onPress={() => undefined}>
            <Text>Quitar</Text>
          </Pressable>,
        ),
      ),
    ).toHaveLength(0);
  });

  it('lee la altura aunque el estilo venga en una lista anidada', () => {
    // React Native admite listas de estilos, y una anidada es lo normal en
    // cuanto hay un estilo base y uno condicional.
    expect(
      demasiadoPequenos(
        analizar(
          <Pressable
            accessible
            accessibilityRole="button"
            style={[{ padding: 4 }, [{ minHeight: 20 }]]}
            onPress={() => undefined}
          >
            <Text>Quitar</Text>
          </Pressable>,
        ),
      ),
    ).toHaveLength(1);
  });
});
