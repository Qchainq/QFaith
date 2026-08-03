// Qué se hace y qué no se hace con lo que pasa por el asistente.
//
// Está en código, y no solo en un documento, porque son reglas que hay que
// poder comprobar con una prueba.

/**
 * Lo que el detector de crisis **nunca** produce.
 *
 * No hay categoría clínica, no hay nivel de riesgo y no hay historial de
 * señales. Marcar a alguien como «riesgo alto» sería un diagnóstico, y el
 * Documento 6 lo prohíbe expresamente. Lo único que se guarda es que un
 * mensaje entró en Modo Crisis, para aplicarle la política de retención.
 */
export const TEMAS_NUNCA_USADOS_PARA_ETIQUETAR = [
  'diagnostico',
  'nivelDeRiesgo',
  'perfilPsicologico',
  'segmentacionPublicitaria',
] as const;

/** Lo que nunca se hace con una conversación. */
export const USOS_PROHIBIDOS = [
  'entrenamiento',
  'publicidad',
  'segmentacion',
  'compartir con otro usuario',
  'compartir con la iglesia',
] as const;
