// De rutas de navegación a pantallas medibles.
//
// El vocabulario de la analítica es cerrado y el de la navegación no tiene
// por qué coincidir con él: son dos listas con vidas distintas, y atarlas por
// convención de nombres haría que renombrar una ruta cambiara en silencio lo
// que se mide.
//
// La tabla es explícita a propósito. Una ruta que no esté aquí **no se
// cuenta**, que es el valor seguro: una pantalla nueva no empieza a medirse
// sola, alguien tiene que decidirlo y añadir su línea.
import type { Pantalla } from '@shared/services/analitica/eventos';

const POR_RUTA: Readonly<Record<string, Pantalla>> = {
  Inicio: 'inicio',
  Portada: 'inicio',
  Biblia: 'biblia',
  Oracion: 'oracion',
  IA: 'ia',
  Perfil: 'perfil',
  Diario: 'diario',
  Habitos: 'habitos',
  Biblioteca: 'biblioteca',
  Memorial: 'memorial',
  Iglesia: 'iglesia',
  Sermones: 'sermones',
  Pulso: 'pulso',
  Planes: 'planes',
};

/** La pantalla que corresponde a esta ruta, o `null` si no se mide. */
export const pantallaDeRuta = (ruta: string | undefined): Pantalla | null =>
  ruta === undefined ? null : (POR_RUTA[ruta] ?? null);
