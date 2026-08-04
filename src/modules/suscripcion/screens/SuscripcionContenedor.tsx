// Contenedor de la suscripción.
import type { PuertoPagos } from '@shared/services/suscripcion/puertoPagos';
import type { RepositorioSuscripcion } from '@shared/services/suscripcion/repositorioSuscripcion';

import { PantallaSuscripcion } from './PantallaSuscripcion';
import {
  useComprar,
  useProductos,
  useRestaurarCompras,
  useSuscripcionActual,
} from '../hooks/useSuscripcion';

export interface PropsSuscripcionContenedor {
  /** Inyectables para las pruebas: evitan depender de la red y de la tienda. */
  readonly pagos?: PuertoPagos;
  readonly repositorio?: RepositorioSuscripcion;
}

export function SuscripcionContenedor({ pagos, repositorio }: PropsSuscripcionContenedor = {}) {
  const suscripcion = useSuscripcionActual(repositorio);
  const productos = useProductos(pagos);
  const comprar = useComprar(pagos);
  const restaurar = useRestaurarCompras(pagos);

  return (
    <PantallaSuscripcion
      suscripcion={suscripcion.data ?? null}
      productos={productos.data ?? []}
      cargando={suscripcion.isPending}
      comprando={comprar.isPending}
      restaurando={restaurar.isPending}
      alComprar={(productoId) => comprar.mutate(productoId)}
      alRestaurar={() => restaurar.mutate()}
    />
  );
}
