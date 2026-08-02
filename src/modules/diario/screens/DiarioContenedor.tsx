// Contenedor del módulo: conecta las pantallas con los hooks.
//
// Las pantallas de arriba son puras —reciben datos y devuelven acciones— para
// poder probarlas sin base de datos ni red. Este componente es el único que
// junta ambas cosas.
import { useState } from 'react';

import { useEliminarEntrada, useGuardarEntrada } from '../hooks/useDiario';
import type { BorradorEntrada, EntradaDiario } from '../models/entradaDiario';
import { PantallaDiario } from './PantallaDiario';
import { PantallaEntradaDiario } from './PantallaEntradaDiario';

type Vista =
  | { readonly nombre: 'lista' }
  | { readonly nombre: 'nueva' }
  | { readonly nombre: 'editar'; readonly entrada: EntradaDiario };

export function DiarioContenedor() {
  const [vista, setVista] = useState<Vista>({ nombre: 'lista' });
  const guardar = useGuardarEntrada();
  const eliminar = useEliminarEntrada();

  const volver = (): void => setVista({ nombre: 'lista' });

  async function guardarYVolver(borrador: BorradorEntrada): Promise<void> {
    await guardar.mutateAsync(borrador);
    volver();
  }

  if (vista.nombre === 'lista') {
    return (
      <PantallaDiario
        alCrear={() => setVista({ nombre: 'nueva' })}
        alAbrir={(entrada) => setVista({ nombre: 'editar', entrada })}
      />
    );
  }

  return (
    <PantallaEntradaDiario
      {...(vista.nombre === 'editar' ? { entrada: vista.entrada } : {})}
      guardando={guardar.isPending}
      alGuardar={guardarYVolver}
      alCancelar={volver}
      {...(vista.nombre === 'editar'
        ? {
            alEliminar: async (id: string) => {
              await eliminar.mutateAsync(id);
              volver();
            },
          }
        : {})}
    />
  );
}
