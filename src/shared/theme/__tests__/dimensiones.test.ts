// Las pantallas en las que esto se usará de verdad, y lo que tiene que
// pasar en cada una. Se prueban tamaños reales con nombre y no números
// redondos: un `medidaDe(1000, 800)` no dice si alguien miró alguna vez una
// tableta, y un iPhone SE sí existe y sigue vendiéndose.
import { ANCHO_MAXIMO_LECTURA, CORTES, MARGEN_LATERAL_MINIMO, medidaDe } from '../dimensiones';
import { espaciado } from '../tokens';

/** Puntos, no píxeles: es lo que ve la aplicación. */
const APARATOS = {
  seVertical: { ancho: 320, alto: 568, nombre: 'iPhone SE' },
  telefonoVertical: { ancho: 390, alto: 844, nombre: 'iPhone 14' },
  telefonoGrandeVertical: { ancho: 430, alto: 932, nombre: 'iPhone Pro Max' },
  telefonoHorizontal: { ancho: 844, alto: 390, nombre: 'iPhone 14 tumbado' },
  plegableCerrado: { ancho: 344, alto: 882, nombre: 'plegable cerrado' },
  plegableAbierto: { ancho: 673, alto: 841, nombre: 'plegable abierto' },
  tabletaVertical: { ancho: 834, alto: 1194, nombre: 'iPad' },
  tabletaHorizontal: { ancho: 1194, alto: 834, nombre: 'iPad tumbado' },
} as const;

const todos = Object.values(APARATOS);

describe('el tamaño se clasifica donde toca', () => {
  it('los teléfonos en vertical son compactos', () => {
    expect(medidaDe(320, 568).tamano).toBe('compacto');
    expect(medidaDe(390, 844).tamano).toBe('compacto');
    expect(medidaDe(430, 932).tamano).toBe('compacto');
  });

  it('un plegable abierto y una tableta en vertical son medios', () => {
    expect(medidaDe(673, 841).tamano).toBe('medio');
    expect(medidaDe(834, 1194).tamano).toBe('medio');
  });

  it('una tableta tumbada es amplia', () => {
    expect(medidaDe(1194, 834).tamano).toBe('amplio');
  });

  it('los cortes son exactamente donde dicen', () => {
    // Justo debajo y justo encima. Un corte con `>` donde debía ir `>=`
    // solo se nota en el punto exacto.
    expect(medidaDe(CORTES.medio - 1, 1000).tamano).toBe('compacto');
    expect(medidaDe(CORTES.medio, 1000).tamano).toBe('medio');
    expect(medidaDe(CORTES.amplio - 1, 1000).tamano).toBe('medio');
    expect(medidaDe(CORTES.amplio, 1000).tamano).toBe('amplio');
  });
});

describe('la orientación', () => {
  it('más ancho que alto es horizontal', () => {
    expect(medidaDe(844, 390).orientacion).toBe('horizontal');
    expect(medidaDe(1194, 834).orientacion).toBe('horizontal');
  });

  it('más alto que ancho es vertical', () => {
    expect(medidaDe(390, 844).orientacion).toBe('vertical');
  });

  it('un cuadrado se trata como vertical', () => {
    // Una ventana partida puede quedar cuadrada. Vertical es la opción sin
    // sorpresas: mantiene el margen de arriba y no reordena nada.
    expect(medidaDe(800, 800).orientacion).toBe('vertical');
  });
});

describe('no estirar la interfaz móvil', () => {
  it('en una tableta el contenido no ocupa toda la pantalla', () => {
    // La frase del Documento 14, comprobada. Una columna de texto de mil
    // píxeles no se puede leer: el ojo pierde el renglón al volver.
    const tableta = medidaDe(APARATOS.tabletaHorizontal.ancho, APARATOS.tabletaHorizontal.alto);

    expect(tableta.anchoDeContenido).toBe(ANCHO_MAXIMO_LECTURA);
    expect(tableta.anchoDeContenido).toBeLessThan(APARATOS.tabletaHorizontal.ancho / 1.5);
    expect(tableta.seCentra).toBe(true);
  });

  it('un plegable al abrirse tampoco estira el texto', () => {
    // Este cae justo por debajo del tope: 673 menos los dos márgenes son 625,
    // y no hay nada que recortar. Es la banda estrecha —entre unos 640 y unos
    // 690 de ventana— en la que el contenido va sin recortar y sin centrar
    // porque ya cabe. Se comprueba la propiedad, no la igualdad: exigir aquí
    // exactamente el tope pediría recortar por debajo de lo disponible, que
    // sería desperdiciar sitio sin ganar legibilidad.
    const abierto = medidaDe(APARATOS.plegableAbierto.ancho, APARATOS.plegableAbierto.alto);

    expect(abierto.anchoDeContenido).toBeLessThanOrEqual(ANCHO_MAXIMO_LECTURA);
    expect(abierto.anchoDeContenido).toBe(APARATOS.plegableAbierto.ancho - espaciado.lg * 2);
  });

  it('nunca, en ninguna pantalla, se pasa del ancho de lectura', () => {
    // La invariante de verdad, y la que hay que sostener: da igual el
    // aparato, el texto no llega a ser más ancho de lo que se puede leer.
    for (const aparato of todos) {
      expect(medidaDe(aparato.ancho, aparato.alto).anchoDeContenido).toBeLessThanOrEqual(
        ANCHO_MAXIMO_LECTURA,
      );
    }
    // Y también en tamaños que no están en la lista, por si mañana hay otro.
    for (let ancho = 200; ancho <= 2000; ancho += 37) {
      expect(medidaDe(ancho, 1000).anchoDeContenido).toBeLessThanOrEqual(ANCHO_MAXIMO_LECTURA);
    }
  });

  it('en un teléfono se usa todo el ancho disponible, sin centrar', () => {
    // Centrar aquí dejaría márgenes desiguales sin ganar nada, y recortar
    // dejaría hueco desperdiciado en la pantalla que menos sitio tiene.
    const telefono = medidaDe(APARATOS.telefonoVertical.ancho, APARATOS.telefonoVertical.alto);

    expect(telefono.anchoDeContenido).toBe(390 - espaciado.lg * 2);
    expect(telefono.seCentra).toBe(false);
  });

  it('un teléfono tumbado sí recorta: es más ancho que una columna legible', () => {
    const tumbado = medidaDe(APARATOS.telefonoHorizontal.ancho, APARATOS.telefonoHorizontal.alto);

    expect(tumbado.anchoDeContenido).toBe(ANCHO_MAXIMO_LECTURA);
    expect(tumbado.seCentra).toBe(true);
  });
});

describe('el teléfono pequeño', () => {
  it('el margen se reduce para no comerse el ancho útil', () => {
    const se = medidaDe(APARATOS.seVertical.ancho, APARATOS.seVertical.alto);

    expect(se.margenLateral).toBe(MARGEN_LATERAL_MINIMO);
    expect(se.margenLateral).toBeLessThan(espaciado.lg);
  });

  it('pero un teléfono normal conserva el margen holgado', () => {
    expect(medidaDe(390, 844).margenLateral).toBe(espaciado.lg);
  });

  it('el margen reducido sigue separando el texto del borde', () => {
    // Reducirlo a cero daría más ancho y el texto quedaría pegado al canto,
    // que es más difícil de leer que un renglón corto.
    expect(MARGEN_LATERAL_MINIMO).toBeGreaterThanOrEqual(espaciado.md);
  });
});

describe('en horizontal se recorta arriba, no a los lados', () => {
  it('el margen superior baja', () => {
    // Lo escaso en horizontal es el alto: un título con el margen de vertical
    // se come media pantalla.
    const tumbado = medidaDe(844, 390);
    const derecho = medidaDe(390, 844);

    expect(tumbado.margenSuperior).toBeLessThan(derecho.margenSuperior);
  });

  it('el lateral no', () => {
    // Estrechar los lados sí afecta a la lectura; acortar arriba, no.
    expect(medidaDe(844, 390).margenLateral).toBe(espaciado.lg);
  });
});

describe('ninguna pantalla real se queda sin sitio', () => {
  it.each(todos.map((a) => [a.nombre, a] as const))('%s', (_nombre, aparato) => {
    const medida = medidaDe(aparato.ancho, aparato.alto);

    // El contenido cabe, con sus dos márgenes.
    expect(medida.anchoDeContenido + medida.margenLateral * 2).toBeLessThanOrEqual(aparato.ancho);
    // Y queda algo con lo que trabajar: la mitad del ancho es un suelo
    // holgado que solo se incumpliría con un margen desproporcionado.
    expect(medida.anchoDeContenido).toBeGreaterThan(aparato.ancho / 2);
  });
});

describe('tamaños imposibles', () => {
  it('una ventana estrechísima no produce un ancho negativo', () => {
    // Puede pasar en una ventana partida al arrastrarla al extremo. Un ancho
    // negativo en un estilo revienta el cálculo de la vista.
    const medida = medidaDe(20, 800);

    expect(medida.anchoDeContenido).toBeGreaterThanOrEqual(0);
    expect(medida.seCentra).toBe(false);
  });

  it('un ancho de cero tampoco', () => {
    // Ocurre durante el primer render, antes de que se mida la ventana.
    expect(medidaDe(0, 0).anchoDeContenido).toBe(0);
  });
});
