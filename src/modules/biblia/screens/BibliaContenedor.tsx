// Contenedor del módulo: conecta las pantallas puras con los hooks.
import { useState } from 'react';

import {
  useCapitulo,
  useEliminarNota,
  useGuardarNota,
  useLibros,
  useMarcadores,
  useMarcar,
  useNotasDelCapitulo,
  useQuitarMarcador,
  useQuitarSubrayado,
  useSubrayar,
  useSubrayadosDelCapitulo,
  useTraducciones,
} from '../hooks/useBiblia';
import type { Libro, Traduccion } from '../models/biblia';
import { PantallaCapitulo } from './PantallaCapitulo';
import { PantallaLibros } from './PantallaLibros';

export function BibliaContenedor() {
  const [traduccion, setTraduccion] = useState<Traduccion | null>(null);
  const [libro, setLibro] = useState<Libro | null>(null);
  const [capitulo, setCapitulo] = useState(1);

  const traducciones = useTraducciones();
  const libros = useLibros(traduccion?.id ?? null);
  const versiculos = useCapitulo({
    traduccionId: traduccion?.id ?? null,
    libro: libro?.codigo ?? null,
    capitulo,
  });
  const notas = useNotasDelCapitulo(libro?.codigo ?? null, capitulo);
  const subrayados = useSubrayadosDelCapitulo(
    traduccion?.id ?? null,
    libro?.codigo ?? null,
    capitulo,
  );

  const marcadores = useMarcadores();

  const guardar = useGuardarNota();
  const eliminar = useEliminarNota();
  const subrayar = useSubrayar();
  const quitarSubrayado = useQuitarSubrayado();
  const marcar = useMarcar();
  const quitarMarcador = useQuitarMarcador();

  if (libro === null) {
    return (
      <PantallaLibros
        traducciones={traducciones.data ?? []}
        traduccionActiva={traduccion}
        libros={libros.data ?? []}
        cargando={traducciones.isPending || (traduccion !== null && libros.isPending)}
        error={traducciones.isError || libros.isError}
        alReintentar={() => {
          void traducciones.refetch();
          void libros.refetch();
        }}
        alElegirTraduccion={setTraduccion}
        alAbrirLibro={(elegido) => {
          setLibro(elegido);
          setCapitulo(1);
        }}
      />
    );
  }

  return (
    <PantallaCapitulo
      nombreLibro={libro.nombre}
      capitulo={capitulo}
      versiculos={versiculos.data ?? []}
      notas={notas.data ?? []}
      subrayados={subrayados.data ?? []}
      cargando={versiculos.isPending}
      error={versiculos.isError}
      guardando={guardar.isPending}
      alSubrayar={(versiculo, estilo) => {
        if (traduccion === null) return;
        subrayar.mutate({
          traduccionId: traduccion.id,
          libro: libro.codigo,
          capitulo,
          // Se subraya el versículo entero: seleccionar palabras sueltas en un
          // móvil es un gesto difícil y el resultado se lee peor.
          versiculoInicio: versiculo,
          versiculoFin: versiculo,
          estilo,
        });
      }}
      alQuitarSubrayado={(id) => quitarSubrayado.mutate(id)}
      marcadorId={
        (marcadores.data ?? []).find(
          (marcador) =>
            marcador.traduccionId === traduccion?.id &&
            marcador.libro === libro.codigo &&
            marcador.capitulo === capitulo &&
            marcador.versiculo === null,
        )?.id ?? null
      }
      alMarcar={() => {
        if (traduccion === null) return;
        marcar.mutate({ traduccionId: traduccion.id, libro: libro.codigo, capitulo });
      }}
      alQuitarMarcador={(id) => quitarMarcador.mutate(id)}
      alReintentar={() => void versiculos.refetch()}
      alGuardarNota={async (texto: string) => {
        await guardar.mutateAsync({
          texto,
          libro: libro.codigo,
          capitulo,
          versiculoInicio: null,
          versiculoFin: null,
          traduccionId: traduccion?.id ?? null,
        });
      }}
      alEliminarNota={async (id: string) => {
        await eliminar.mutateAsync(id);
      }}
      alVolver={() => setLibro(null)}
    />
  );
}
