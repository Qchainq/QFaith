// Leer un registro que no esté en la papelera.
//
// `AlmacenLocal.obtener` devuelve el registro **aunque esté marcado de baja**,
// y tiene que ser así: el motor de sincronización necesita ver los borrados
// para propagarlos y para resolver conflictos. Pero un repositorio que lo use
// para responder a una pantalla enseña algo que la persona ya borró, y si
// además lo edita, lo resucita sin que nadie lo haya pedido —justo lo que el
// invariante 5 prohíbe.
//
// La distinción es fácil de olvidar porque `listar` sí filtra por defecto y
// uno da por hecho que `obtener` hace lo mismo. Este ayudante existe para que
// la diferencia se lea en el nombre.
import type { AlmacenLocal, RegistroLocal } from './tipos';

/**
 * Registro vigente, o `null` si no existe o está en la papelera.
 *
 * Es lo que debe usar cualquier lectura destinada al usuario o previa a una
 * edición. Para propagar cambios y resolver conflictos, `almacen.obtener`
 * directamente.
 */
export async function obtenerVigente(
  almacen: AlmacenLocal,
  tipoEntidad: string,
  id: string,
): Promise<RegistroLocal | null> {
  const registro = await almacen.obtener(tipoEntidad, id);
  return registro === null || registro.eliminadoEn !== null ? null : registro;
}
