// Puerto de pagos.
//
// El proveedor todavía no está decidido, y esta interfaz existe precisamente
// para que esa decisión no bloquee nada ni se filtre por el resto del código.
// Cuando se elija —StoreKit y Play Billing directos, o un intermediario— se
// escribe una implementación de esto y no cambia nada más.
//
// Tres reglas que la interfaz impone por su forma:
//
//   1. **Los precios los da la tienda, no el código.** `productos()` devuelve
//      lo que la plataforma dice en ese momento y en la moneda de la persona.
//      Un precio escrito en el repositorio quedaría desfasado respecto a lo
//      que se ve al pagar, y en pagos eso no es un detalle (Documento 14).
//
//   2. **Comprar no concede acceso.** Devuelve un recibo, y el acceso lo
//      concede el servidor tras validarlo. Si el cliente pudiera conceder
//      acceso, bastaría con manipular la aplicación.
//
//   3. **Restaurar existe siempre.** Cambiar de teléfono no puede obligar a
//      pagar dos veces, y las dos tiendas lo exigen para aprobar la
//      aplicación.

/** Un producto tal y como lo describe la tienda. */
export interface ProductoTienda {
  readonly id: string;
  /** Ya formateado por la plataforma, en la moneda de la persona. */
  readonly precio: string;
  readonly periodicidad: 'mensual' | 'anual';
  /** Días de prueba, si el producto la ofrece. */
  readonly diasDePrueba: number;
}

/**
 * Recibo de compra.
 *
 * Es opaco a propósito: lo entiende el proveedor y lo valida el servidor. La
 * aplicación no lo interpreta ni lo guarda.
 */
export interface ReciboCompra {
  readonly proveedor: 'apple' | 'google';
  readonly datos: string;
}

export interface PuertoPagos {
  productos(): Promise<readonly ProductoTienda[]>;
  /** Abre el diálogo de la tienda. `null` si la persona lo cancela. */
  comprar(productoId: string): Promise<ReciboCompra | null>;
  /** Compras anteriores de esta cuenta de tienda. Ver regla 3. */
  restaurar(): Promise<readonly ReciboCompra[]>;
}

/**
 * Implementación vacía, mientras no haya proveedor.
 *
 * No lanza: una pantalla que pregunte por los productos debe poder pintarse y
 * decir que ahora mismo no hay nada que comprar, no romperse. Y **nunca
 * concede acceso**: devolver un recibo falso aquí sería abrir el contenido de
 * pago a todo el mundo mientras dure el andamio.
 */
export const pagosNoDisponibles: PuertoPagos = {
  productos: async () => [],
  comprar: async () => null,
  restaurar: async () => [],
};
