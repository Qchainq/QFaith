// Contenedor de la exportación.
import { PantallaExportar } from './PantallaExportar';
import { useExportarContenido } from '../hooks/useExportacion';

export interface PropsExportarContenedor {
  /**
   * Entregar el archivo al sistema para guardarlo o compartirlo.
   *
   * Se recibe de fuera porque depende de la plataforma, y porque este módulo
   * no debe decidir a dónde va el archivo más peligroso que la persona tendrá
   * nunca: eso lo elige ella en el diálogo del sistema.
   */
  readonly alCompartir?: (contenido: string) => void;
}

export function ExportarContenedor({ alCompartir }: PropsExportarContenedor = {}) {
  const exportar = useExportarContenido();

  return (
    <PantallaExportar
      exportacion={exportar.data ?? null}
      generando={exportar.isPending}
      alGenerar={() => exportar.mutate()}
      {...(alCompartir === undefined
        ? {}
        : {
            // La pantalla solo ofrece compartir cuando ya hay copia, así que
            // aquí no hace falta volver a comprobarlo.
            alCompartir: () => {
              alCompartir(JSON.stringify(exportar.data, null, 2));
            },
          })}
    />
  );
}
