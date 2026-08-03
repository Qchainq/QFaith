// Contenedor del módulo: conecta las pantallas puras con los hooks.
//
// Acepta un borrador de entrada para el caso que da sentido al módulo: llegar
// aquí desde una oración que se acaba de marcar respondida, con el título y
// las personas ya puestos.
import { useState } from 'react';

import {
  useAlternarFavorito,
  useEliminarMemorial,
  useGuardarMemorial,
  useMemoriales,
} from '../hooks/useMemorial';
import type { BorradorMemorial, Memorial } from '../models/memorial';
import { porAno, soloFavoritos as filtrarFavoritos } from '../use-cases/gestionMemoriales';
import { PantallaEditarMemorial } from './PantallaEditarMemorial';
import { PantallaMemorial } from './PantallaMemorial';

type Vista =
  | { readonly nombre: 'lista' }
  | { readonly nombre: 'editar'; readonly memorial?: Memorial | BorradorMemorial };

export interface PropsMemorialContenedor {
  /** Borrador con el que abrir directamente el editor. */
  readonly borradorInicial?: BorradorMemorial;
}

export function MemorialContenedor({ borradorInicial }: PropsMemorialContenedor = {}) {
  const [vista, setVista] = useState<Vista>(
    borradorInicial === undefined
      ? { nombre: 'lista' }
      : { nombre: 'editar', memorial: borradorInicial },
  );
  const [favoritos, setFavoritos] = useState(false);

  const consulta = useMemoriales();
  const guardar = useGuardarMemorial();
  const alternar = useAlternarFavorito();
  const eliminar = useEliminarMemorial();

  const volver = (): void => setVista({ nombre: 'lista' });

  if (vista.nombre === 'lista') {
    return (
      <PantallaMemorial
        tramos={porAno(filtrarFavoritos(consulta.data?.memoriales ?? [], favoritos))}
        ilegibles={consulta.data?.ilegibles ?? 0}
        soloFavoritos={favoritos}
        cargando={consulta.isPending}
        alCrear={() => setVista({ nombre: 'editar' })}
        alAbrir={(memorial) => setVista({ nombre: 'editar', memorial })}
        alAlternarFavorito={(id) => alternar.mutate(id)}
        alFiltrar={setFavoritos}
      />
    );
  }

  const enEdicion = vista.memorial;

  return (
    <PantallaEditarMemorial
      {...(enEdicion === undefined ? {} : { memorial: enEdicion })}
      guardando={guardar.isPending}
      alGuardar={async (borrador: BorradorMemorial) => {
        await guardar.mutateAsync(borrador);
        volver();
      }}
      alCancelar={volver}
      {...(enEdicion?.id === undefined
        ? {}
        : {
            alEliminar: async (id: string) => {
              await eliminar.mutateAsync(id);
              volver();
            },
          })}
    />
  );
}
