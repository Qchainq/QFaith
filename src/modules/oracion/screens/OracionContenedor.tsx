// Contenedor del módulo: conecta las pantallas puras con los hooks.
import { useState } from 'react';

import {
  useCambiarEstadoPeticion,
  useEliminarPeticion,
  useGuardarPeticion,
} from '../hooks/useOracion';
import type { BorradorPeticion, EstadoPeticion, Peticion } from '../models/peticion';
import { PantallaListaOracion } from './PantallaListaOracion';
import { PantallaPeticion } from './PantallaPeticion';

type Vista =
  | { readonly nombre: 'lista' }
  | { readonly nombre: 'nueva' }
  | { readonly nombre: 'editar'; readonly peticion: Peticion };

export function OracionContenedor() {
  const [vista, setVista] = useState<Vista>({ nombre: 'lista' });
  const guardar = useGuardarPeticion();
  const cambiarEstado = useCambiarEstadoPeticion();
  const eliminar = useEliminarPeticion();

  const volver = (): void => setVista({ nombre: 'lista' });

  if (vista.nombre === 'lista') {
    return (
      <PantallaListaOracion
        alCrear={() => setVista({ nombre: 'nueva' })}
        alAbrir={(peticion) => setVista({ nombre: 'editar', peticion })}
      />
    );
  }

  const enEdicion = vista.nombre === 'editar' ? vista.peticion : undefined;

  return (
    <PantallaPeticion
      {...(enEdicion === undefined ? {} : { peticion: enEdicion })}
      guardando={guardar.isPending}
      alGuardar={async (borrador: BorradorPeticion) => {
        await guardar.mutateAsync(borrador);
        volver();
      }}
      alCancelar={volver}
      {...(enEdicion === undefined
        ? {}
        : {
            alCambiarEstado: async (estado: EstadoPeticion) => {
              await cambiarEstado.mutateAsync({ id: enEdicion.id, estado });
              volver();
            },
            alEliminar: async (id: string) => {
              await eliminar.mutateAsync(id);
              volver();
            },
          })}
    />
  );
}
