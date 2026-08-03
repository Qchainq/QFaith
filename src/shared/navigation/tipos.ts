// Rutas tipadas. Ninguna pantalla existe si no está en el Documento 10.

/**
 * Pila del inicio. El Diario es un módulo secundario y se alcanza desde aquí,
 * no desde una pestaña propia: las pestañas son cinco y están fijadas.
 */
export type InicioParamList = {
  Portada: undefined;
  Diario: undefined;
  Habitos: undefined;
  Biblioteca: undefined;
  Memorial: undefined;
  Iglesia: undefined;
  Sermones: undefined;
};

export type PestanasParamList = {
  Inicio: undefined;
  Biblia: undefined;
  Oracion: undefined;
  IA: undefined;
  Perfil: undefined;
};

export type RaizParamList = {
  Pestanas: undefined;
};
