// Contenedor del Pulso Espiritual.
import { useState } from 'react';

import { fechaDeHoy } from '../models/pulso';
import { useGuardarPulso, usePulsoDeHoy } from '../hooks/usePulso';
import { PantallaPulso } from './PantallaPulso';

export interface PropsPulsoContenedor {
  /** Inyectable para que la prueba no dependa del día en que se ejecute. */
  readonly hoy?: string;
}

export function PulsoContenedor({ hoy = fechaDeHoy() }: PropsPulsoContenedor = {}) {
  const [editando, setEditando] = useState(false);

  const pulso = usePulsoDeHoy(hoy);
  const guardar = useGuardarPulso();

  return (
    <PantallaPulso
      pulsoDeHoy={pulso.data ?? null}
      cargando={pulso.isPending}
      guardando={guardar.isPending}
      editando={editando}
      alCambiar={() => setEditando(true)}
      alResponder={(estado, nota) => {
        guardar.mutate(
          { fecha: hoy, estado, nota },
          // Se sale del editor solo cuando quedó guardado. Si algo falla, lo
          // elegido sigue en pantalla.
          { onSuccess: () => setEditando(false) },
        );
      }}
    />
  );
}
