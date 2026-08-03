// Contenedor del módulo: conecta las pantallas puras con los hooks.
import { useState } from 'react';

import {
  useAnotarAvance,
  useAvances,
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
  const anotar = useAnotarAvance();

  // Los avances cuelgan de una petición ya guardada. Con la lista abierta o
  // creando una nueva no hay a qué colgarlos, y la consulta queda vacía.
  const peticionAbierta = vista.nombre === 'editar' ? vista.peticion.id : '';
  const avances = useAvances(peticionAbierta);

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
            avances: avances.data ?? [],
            anotando: anotar.isPending,
            alAnotarAvance: async (texto: string) => {
              // No se vuelve a la lista: anotar un avance es seguir en la
              // misma petición, no terminar con ella.
              await anotar.mutateAsync({ peticionId: enEdicion.id, texto });
            },
          })}
    />
  );
}
