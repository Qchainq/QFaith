// Contenedor de los planes de lectura.
//
// Junta las dos mitades del módulo: el catálogo, que es de todos, y el
// seguimiento, que es de cada uno. La pantalla no sabe que vienen de sitios
// distintos y no tiene por qué saberlo.
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useCambiarEstadoPlan,
  useCompletarDia,
  useDiasDelPlan,
  useDiasLeidos,
  useEmpezarPlan,
  useMisPlanes,
  usePlanesDisponibles,
  useProgreso,
} from '../hooks/usePlanes';
import { PantallaDiaPlan } from './PantallaDiaPlan';
import { PantallaPlanes, type InscripcionConPlan } from './PantallaPlanes';

type Vista = { readonly nombre: 'lista' } | { readonly nombre: 'dia'; readonly id: string };

export function PlanesContenedor() {
  const { i18n } = useTranslation();
  const [vista, setVista] = useState<Vista>({ nombre: 'lista' });

  const catalogo = usePlanesDisponibles(i18n.language);
  const mios = useMisPlanes();
  const leidos = useDiasLeidos();
  const empezar = useEmpezarPlan();
  const completar = useCompletarDia();
  const cambiarEstado = useCambiarEstadoPlan();

  const abierta =
    vista.nombre === 'dia' ? ((mios.data ?? []).find((i) => i.id === vista.id) ?? null) : null;

  const progreso = useProgreso(abierta?.id ?? '');
  const dias = useDiasDelPlan(abierta?.planId ?? '');

  const planPorId = useMemo(
    () => new Map((catalogo.data ?? []).map((plan) => [plan.id, plan])),
    [catalogo.data],
  );

  if (abierta !== null) {
    const plan = planPorId.get(abierta.planId) ?? null;
    const delDia = (dias.data ?? []).find((d) => d.numero === abierta.diaActual) ?? null;
    const leido = (progreso.data ?? []).find((d) => d.numero === abierta.diaActual) ?? null;

    return (
      <PantallaDiaPlan
        dia={delDia}
        leido={leido}
        cargando={dias.isPending || progreso.isPending}
        guardando={completar.isPending}
        alVolver={() => setVista({ nombre: 'lista' })}
        alMarcarLeido={(reflexion) => {
          completar.mutate({
            inscripcionId: abierta.id,
            numero: abierta.diaActual,
            totalDias: plan?.dias ?? abierta.diaActual,
            reflexion,
          });
        }}
      />
    );
  }

  const entradas: readonly InscripcionConPlan[] = (mios.data ?? []).map((inscripcion) => ({
    inscripcion,
    plan: planPorId.get(inscripcion.planId) ?? null,
    diasLeidos: leidos.data?.get(inscripcion.id) ?? 0,
  }));

  return (
    <PantallaPlanes
      mios={entradas}
      catalogo={catalogo.data ?? []}
      cargando={mios.isPending}
      empezando={empezar.isPending}
      alEmpezar={(planId) => empezar.mutate(planId)}
      alAbrir={(id) => setVista({ nombre: 'dia', id })}
      alCambiarEstado={(inscripcionId, accion) => cambiarEstado.mutate({ inscripcionId, accion })}
    />
  );
}
