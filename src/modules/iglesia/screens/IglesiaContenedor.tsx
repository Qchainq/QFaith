// Contenedor del módulo Iglesia.
import { useState } from 'react';

import type { RepositorioIglesia } from '@shared/services/supabase/repositorioIglesia';
import { useEstadoSesion } from '@shared/state/estadoSesion';

import {
  useAbandonarIglesia,
  useAlternarInscripcion,
  useBuscarIglesia,
  useEventos,
  useGrupos,
  useMentorias,
  useMisIglesias,
  useSolicitarIngreso,
  useTerminarMentoria,
} from '../hooks/useIglesia';
import type { Iglesia } from '../models/iglesia';
import { PantallaIglesia } from './PantallaIglesia';

export interface PropsIglesiaContenedor {
  /** Inyectable para las pruebas: evita depender de la red. */
  readonly repositorio?: RepositorioIglesia;
}

export function IglesiaContenedor({ repositorio }: PropsIglesiaContenedor = {}) {
  const [codigo, setCodigo] = useState('');
  const [encontrada, setEncontrada] = useState<Iglesia | null>(null);
  const [buscada, setBuscada] = useState(false);

  const usuarioId = useEstadoSesion((estado) => estado.usuario?.id ?? '');

  const mias = useMisIglesias(repositorio);
  // La primera iglesia activa manda: grupos y eventos son los suyos. Con más
  // de una, el selector llega cuando haga falta; hoy no hay quien tenga dos.
  const activa = (mias.data ?? []).find((entrada) => entrada.membresia.estado === 'active');
  const iglesiaId = activa?.iglesia.id ?? null;

  const grupos = useGrupos(iglesiaId, repositorio);
  const eventos = useEventos(iglesiaId, repositorio);
  const mentorias = useMentorias(repositorio);

  const buscar = useBuscarIglesia(repositorio);
  const unirse = useSolicitarIngreso(repositorio);
  const abandonar = useAbandonarIglesia(repositorio);
  const inscripcion = useAlternarInscripcion(repositorio);
  const terminar = useTerminarMentoria(repositorio);

  return (
    <PantallaIglesia
      mias={mias.data ?? []}
      grupos={grupos.data ?? []}
      eventos={eventos.data ?? []}
      mentorias={mentorias.data ?? []}
      usuarioId={usuarioId}
      codigo={codigo}
      encontrada={encontrada}
      buscada={buscada}
      cargando={mias.isPending}
      trabajando={
        buscar.isPending ||
        unirse.isPending ||
        abandonar.isPending ||
        inscripcion.isPending ||
        terminar.isPending
      }
      alEscribirCodigo={(valor) => {
        setCodigo(valor);
        // Escribir de nuevo borra el resultado anterior: dejarlo llevaría a
        // unirse a una iglesia distinta de la que se acaba de teclear.
        setEncontrada(null);
        setBuscada(false);
      }}
      alBuscar={() => {
        buscar.mutate(codigo, {
          onSuccess: (iglesia) => {
            setEncontrada(iglesia);
            setBuscada(true);
          },
          onError: () => {
            setEncontrada(null);
            setBuscada(true);
          },
        });
      }}
      alUnirse={(id) =>
        unirse.mutate(id, {
          onSuccess: () => {
            setEncontrada(null);
            setBuscada(false);
            setCodigo('');
          },
        })
      }
      alAbandonar={(membresiaId) => abandonar.mutate(membresiaId)}
      alAlternarInscripcion={(eventoId, inscrito) => inscripcion.mutate({ eventoId, inscrito })}
      alTerminarMentoria={(mentoriaId) => terminar.mutate(mentoriaId)}
    />
  );
}
