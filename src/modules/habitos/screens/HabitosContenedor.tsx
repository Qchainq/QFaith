// Contenedor del módulo: conecta las pantallas puras con los hooks.
import { useState } from 'react';

import {
  useAlternarHoy,
  useEliminarHabito,
  useGuardarHabito,
  useHabitos,
  useResumenes,
} from '../hooks/useHabitos';
import type { BorradorHabito, Habito } from '../models/habito';
import type { ResumenHabito } from '../use-cases/gestionHabitos';
import { PantallaHabito } from './PantallaHabito';
import { PantallaHabitos } from './PantallaHabitos';

type Vista =
  | { readonly nombre: 'lista' }
  | { readonly nombre: 'nuevo' }
  | { readonly nombre: 'editar'; readonly habito: Habito };

export function HabitosContenedor() {
  const [vista, setVista] = useState<Vista>({ nombre: 'lista' });
  const consulta = useHabitos();
  const habitos = consulta.data?.habitos ?? [];
  const resumenesConsulta = useResumenes(habitos.map((habito) => habito.id));

  const guardar = useGuardarHabito();
  const alternar = useAlternarHoy();
  const eliminar = useEliminarHabito();

  const volver = (): void => setVista({ nombre: 'lista' });

  if (vista.nombre === 'lista') {
    const resumenes: Record<string, ResumenHabito | undefined> = {};
    habitos.forEach((habito, indice) => {
      resumenes[habito.id] = resumenesConsulta[indice]?.data;
    });

    return (
      <PantallaHabitos
        habitos={habitos}
        resumenes={resumenes}
        ilegibles={consulta.data?.ilegibles ?? 0}
        cargando={consulta.isPending}
        error={consulta.isError}
        alReintentar={() => void consulta.refetch()}
        alCrear={() => setVista({ nombre: 'nuevo' })}
        alAbrir={(habito) => setVista({ nombre: 'editar', habito })}
        alAlternarHoy={(habitoId) => alternar.mutate(habitoId)}
      />
    );
  }

  const enEdicion = vista.nombre === 'editar' ? vista.habito : undefined;

  return (
    <PantallaHabito
      {...(enEdicion === undefined ? {} : { habito: enEdicion })}
      guardando={guardar.isPending}
      alGuardar={async (borrador: BorradorHabito) => {
        await guardar.mutateAsync(borrador);
        volver();
      }}
      alCancelar={volver}
      {...(enEdicion === undefined
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
