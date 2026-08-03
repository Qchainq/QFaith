// Contenedor del módulo de Sermones.
import { useState } from 'react';

import type { RepositorioIglesia } from '@shared/services/supabase/repositorioIglesia';

import {
  useAcciones,
  useAlternarHecha,
  useEliminarNota,
  useGuardarAccion,
  useGuardarNota,
  useNotas,
  useSermonesPublicados,
} from '../hooks/useSermones';
import {
  pendientesPrimero,
  type BorradorAccion,
  type BorradorNota,
  type NotaSermon,
} from '../models/sermon';
import { componer, sueltas } from '../use-cases/gestionSermones';
import { PantallaEditarNota } from './PantallaEditarNota';
import { PantallaNuevaAccion } from './PantallaNuevaAccion';
import { PantallaSermones } from './PantallaSermones';

type Vista =
  | { readonly nombre: 'lista' }
  | { readonly nombre: 'nota'; readonly nota?: NotaSermon; readonly sermonId: string | null }
  | { readonly nombre: 'accion' };

export interface PropsSermonesContenedor {
  /** Inyectable para las pruebas: evita depender de la red. */
  readonly repositorioIglesia?: RepositorioIglesia;
}

export function SermonesContenedor({ repositorioIglesia }: PropsSermonesContenedor = {}) {
  const [vista, setVista] = useState<Vista>({ nombre: 'lista' });

  const notas = useNotas();
  const acciones = useAcciones();
  const publicados = useSermonesPublicados(repositorioIglesia);

  const guardarNota = useGuardarNota();
  const eliminarNota = useEliminarNota();
  const guardarAccion = useGuardarAccion();
  const alternar = useAlternarHecha();

  const volver = (): void => setVista({ nombre: 'lista' });

  if (vista.nombre === 'nota') {
    return (
      <PantallaEditarNota
        {...(vista.nota === undefined ? {} : { nota: vista.nota })}
        sermonId={vista.sermonId}
        guardando={guardarNota.isPending}
        alGuardar={async (borrador: BorradorNota) => {
          await guardarNota.mutateAsync(borrador);
          volver();
        }}
        alCancelar={volver}
        {...(vista.nota === undefined
          ? {}
          : {
              alEliminar: async (id: string) => {
                await eliminarNota.mutateAsync(id);
                volver();
              },
            })}
      />
    );
  }

  if (vista.nombre === 'accion') {
    return (
      <PantallaNuevaAccion
        guardando={guardarAccion.isPending}
        alGuardar={async (borrador: BorradorAccion) => {
          await guardarAccion.mutateAsync(borrador);
          volver();
        }}
        alCancelar={volver}
      />
    );
  }

  const todas = notas.data?.notas ?? [];

  return (
    <PantallaSermones
      sermones={componer(publicados.data ?? [], todas)}
      notasSueltas={sueltas(todas)}
      acciones={pendientesPrimero(acciones.data ?? [])}
      ilegibles={notas.data?.ilegibles ?? 0}
      cargando={notas.isPending}
      alEscribirNota={(sermonId) => setVista({ nombre: 'nota', sermonId })}
      alAbrirNota={(nota) => setVista({ nombre: 'nota', nota, sermonId: nota.sermonId })}
      alNuevaAccion={() => setVista({ nombre: 'accion' })}
      alAlternarHecha={(id) => alternar.mutate(id)}
    />
  );
}
