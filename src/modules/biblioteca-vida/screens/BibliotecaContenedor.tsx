// Contenedor del módulo.
import { useState } from 'react';

import { useBiblioteca, useOrganizar } from '../hooks/useBiblioteca';
import { filtrarPorTema } from '../use-cases/organizarBiblioteca';
import { PantallaBiblioteca } from './PantallaBiblioteca';

export function BibliotecaContenedor() {
  const [tema, setTema] = useState<string | null>(null);
  const consulta = useBiblioteca();
  const organizar = useOrganizar();

  return (
    <PantallaBiblioteca
      elementos={filtrarPorTema(consulta.data?.elementos ?? [], tema)}
      ilegibles={consulta.data?.ilegibles ?? 0}
      temaActivo={tema}
      cargando={consulta.isPending}
      organizando={organizar.isPending}
      alElegirTema={setTema}
      alOrganizar={() => organizar.mutate()}
    />
  );
}
