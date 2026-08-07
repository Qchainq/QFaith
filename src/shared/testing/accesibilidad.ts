// Comprobaciones de accesibilidad sobre un árbol ya renderizado.
//
// Vive aquí y no dentro de una prueba porque la usan varias: la de las
// pestañas principales, la de cada módulo y la que barre todas las pantallas.
// Repetir la lógica en cada una haría que se corrigiera en un sitio y no en
// los otros.
//
// Lo que se comprueba es lo que el Documento 14 pide y se puede medir sin un
// dispositivo: nombre para el lector de pantalla, área táctil suficiente y que
// el estado no dependa solo del color. El contraste tiene sus propias pruebas,
// porque se calcula de los tokens y no del árbol.
import type { ReactTestInstance } from 'react-test-renderer';

import { AREA_TACTIL_MINIMA } from '@shared/theme/tokens';

/** Elementos con los que se puede interactuar. */
const ROLES_INTERACTIVOS = new Set(['button', 'link', 'checkbox', 'switch', 'radio', 'tab']);

const esInteractivo = (nodo: ReactTestInstance): boolean => {
  const props = nodo.props as Record<string, unknown>;
  if (typeof props.onPress !== 'function') return false;
  // Los nodos internos de React Native repiten `onPress` hacia abajo; solo
  // cuenta el que además se declara accesible, que es el que ve el lector.
  return props.accessible === true || ROLES_INTERACTIVOS.has(String(props.accessibilityRole));
};

export interface Interactivo {
  readonly nombre: string;
  readonly rol: string;
  readonly alturaMinima: number | null;
}

/** Aplana los estilos de React Native, que pueden venir anidados en listas. */
export function estiloPlano(estilo: unknown): Record<string, unknown> {
  if (Array.isArray(estilo)) {
    return estilo.reduce<Record<string, unknown>>(
      (acumulado, parte) => ({ ...acumulado, ...estiloPlano(parte) }),
      {},
    );
  }
  return typeof estilo === 'object' && estilo !== null ? (estilo as Record<string, unknown>) : {};
}

/** Texto visible dentro de un nodo, para cuando no hay etiqueta explícita. */
function textoDe(nodo: ReactTestInstance): string {
  const hijos = nodo.props.children as unknown;
  const recorrer = (valor: unknown): string => {
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'number') return String(valor);
    if (Array.isArray(valor)) return valor.map(recorrer).join(' ');
    return '';
  };
  const directo = recorrer(hijos).trim();
  if (directo.length > 0) return directo;

  // Un botón cuyo texto está en un hijo `Texto`: se busca hacia abajo.
  return nodo
    .findAllByType('Text' as never, { deep: true })
    .map((hijo) => recorrer(hijo.props.children))
    .join(' ')
    .trim();
}

/** Todos los elementos interactivos del árbol, con lo que hace falta medir. */
export function interactivosDe(raiz: ReactTestInstance): readonly Interactivo[] {
  return raiz.findAll(esInteractivo, { deep: true }).map((nodo) => {
    const props = nodo.props as Record<string, unknown>;
    const estilo = estiloPlano(props.style);
    const altura = estilo.minHeight ?? estilo.height;

    return {
      nombre:
        typeof props.accessibilityLabel === 'string' && props.accessibilityLabel.length > 0
          ? props.accessibilityLabel
          : textoDe(nodo),
      rol: String(props.accessibilityRole ?? ''),
      alturaMinima: typeof altura === 'number' ? altura : null,
    };
  });
}

/** Los que un lector de pantalla anunciaría como «botón» y nada más. */
export const sinNombre = (elementos: readonly Interactivo[]): readonly Interactivo[] =>
  elementos.filter((elemento) => elemento.nombre.length === 0);

export const sinRol = (elementos: readonly Interactivo[]): readonly Interactivo[] =>
  elementos.filter((elemento) => !ROLES_INTERACTIVOS.has(elemento.rol));

/**
 * Los que declaran una altura por debajo del mínimo.
 *
 * Los que no la declaran no se cuentan: su tamaño lo da el contenido y no se
 * puede medir sin un dispositivo. Declarar una altura menor que el mínimo sí
 * es una decisión explícita y equivocada.
 */
export const demasiadoPequenos = (elementos: readonly Interactivo[]): readonly Interactivo[] =>
  elementos.filter(
    (elemento) => elemento.alturaMinima !== null && elemento.alturaMinima < AREA_TACTIL_MINIMA,
  );
