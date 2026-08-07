// Lo que se mide y lo que nunca sale.
//
// Las pruebas están escritas contra la lista de prohibido del Documento 14,
// con textos que se parecen a lo que alguien escribiría de verdad. Un caso
// con `'x'` dentro pasaría igual y no demostraría nada: lo que hay que ver
// aquí es una frase reconociblemente íntima intentando salir y no pudiendo.
import { ErrorApp } from '@shared/errores/erroresApp';

import {
  esCodigoMedible,
  esEventoPermitido,
  FUNCIONES,
  PANTALLAS,
  TIPOS_EVENTO,
  type EventoAnalitica,
} from '../eventos';
import { analiticaNoDisponible, type ContextoAnalitica } from '../puertoAnalitica';
import { crearServicioAnalitica } from '../servicioAnalitica';

const CONTEXTO: ContextoAnalitica = {
  version: '1.0.0',
  plataforma: 'android',
  versionSistema: '14',
  sesionId: 'sesion-de-prueba',
};

/** Frases inventadas, del tipo que la lista de prohibido protege. */
const CONFESION = 'Llevo meses sin poder perdonar a mi padre y me da vergüenza.';
const NOMBRE_EN_PETICION = 'Por la salud de mi hermana Marta';

function montar(opciones?: { readonly fallaElEnvio?: boolean }) {
  const enviados: { evento: EventoAnalitica; contexto: ContextoAnalitica }[] = [];
  const rechazados: string[] = [];
  let olvidos = 0;

  const servicio = crearServicioAnalitica({
    contexto: CONTEXTO,
    alRechazar: (tipo) => rechazados.push(tipo),
    puerto: {
      enviar: async (evento, contexto) => {
        if (opciones?.fallaElEnvio === true) throw new Error('el proveedor no responde');
        enviados.push({ evento, contexto });
      },
      olvidar: async () => {
        olvidos += 1;
      },
    },
  });

  return { servicio, enviados, rechazados, olvidos: () => olvidos };
}

describe('consentimiento', () => {
  it('sin consentir no sale nada', async () => {
    const { servicio, enviados } = montar();

    const enviado = await servicio.registrar({ tipo: 'sesion.iniciada' });

    expect(enviado).toBe(false);
    expect(enviados).toHaveLength(0);
  });

  it('nace apagada', () => {
    // Privacidad por defecto. Una analítica que empieza encendida ya ha
    // enviado lo primero antes de que nadie decida nada.
    expect(montar().servicio.activa()).toBe(false);
  });

  it('consentida, envía', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    const enviado = await servicio.registrar({ tipo: 'pantalla.abierta', pantalla: 'diario' });

    expect(enviado).toBe(true);
    expect(enviados).toHaveLength(1);
  });

  it('retirar el consentimiento pide al proveedor que olvide', async () => {
    // No basta con dejar de enviar: el Documento 14 exige retirada **y**
    // eliminación. Una opción que solo cierra el grifo hacia adelante deja lo
    // ya enviado donde estaba, y quien la pulsa cree otra cosa.
    const { servicio, olvidos } = montar();
    await servicio.consentir(true);

    await servicio.consentir(false);

    expect(olvidos()).toBe(1);
  });

  it('apagar lo que ya estaba apagado no pide olvidar', async () => {
    const { servicio, olvidos } = montar();

    await servicio.consentir(false);

    expect(olvidos()).toBe(0);
  });

  it('tras retirarlo deja de enviar', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);
    await servicio.registrar({ tipo: 'sesion.iniciada' });

    await servicio.consentir(false);
    await servicio.registrar({ tipo: 'sesion.iniciada' });

    expect(enviados).toHaveLength(1);
  });

  it('volver a encenderla no recupera lo que no se envió', async () => {
    // Enviar retroactivamente lo de mientras estuvo apagada sería enviar algo
    // que en su momento nadie consintió.
    const { servicio, enviados } = montar();
    await servicio.registrar({ tipo: 'sesion.iniciada' });
    await servicio.registrar({ tipo: 'sesion.iniciada' });

    await servicio.consentir(true);

    expect(enviados).toHaveLength(0);
  });
});

describe('lo que nunca sale', () => {
  it('no hay forma de enviar un texto del diario', async () => {
    const { servicio, enviados, rechazados } = montar();
    await servicio.consentir(true);

    // Solo se llega aquí saltándose los tipos, que es justamente el caso
    // contra el que existe la comprobación en ejecución: un `as`, un `any` de
    // una biblioteca o un dato que venga de la red.
    const enviado = await servicio.registrar({
      tipo: 'funcion.usada',
      funcion: 'diario.escribir',
      texto: CONFESION,
    } as unknown as EventoAnalitica);

    expect(enviado).toBe(false);
    expect(enviados).toHaveLength(0);
    expect(JSON.stringify(enviados)).not.toContain('perdonar');
    // Se avisa del tipo, nunca del evento: el aviso acabaría en un informe de
    // errores con dentro lo que se acaba de impedir que saliera.
    expect(rechazados).toEqual(['funcion.usada']);
    expect(JSON.stringify(rechazados)).not.toContain('perdonar');
  });

  it('un nombre metido en una petición tampoco pasa', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({
      tipo: 'funcion.usada',
      funcion: 'oracion.pedir',
      por: NOMBRE_EN_PETICION,
    } as unknown as EventoAnalitica);

    expect(JSON.stringify(enviados)).not.toContain('Marta');
  });

  it('el ánimo del Pulso no es un evento, ni un campo de uno', () => {
    // «Estado espiritual concreto» está en la lista de prohibido. Que alguien
    // respondió al Pulso sí se puede contar; qué respondió, no. Es de lo más
    // íntimo que guarda la aplicación.
    expect(FUNCIONES).toContain('pulso.responder');

    expect(
      esEventoPermitido({ tipo: 'funcion.usada', funcion: 'pulso.responder', animo: 'tentado' }),
    ).toBe(false);
    expect(TIPOS_EVENTO.some((tipo) => tipo.includes('animo') || tipo.includes('pulso'))).toBe(
      false,
    );
  });

  it('no viaja ningún identificador de cuenta', async () => {
    // «De forma agregada», dice el documento. Una analítica con el
    // identificador de la persona dentro no lo es por mucho que se llame así.
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({ tipo: 'pantalla.abierta', pantalla: 'memorial' });

    const crudo = JSON.stringify(enviados);
    expect(crudo).not.toContain('usuarioId');
    expect(crudo).not.toContain('user_id');
    expect(Object.keys(enviados[0]?.contexto ?? {}).sort()).toEqual([
      'plataforma',
      'sesionId',
      'version',
      'versionSistema',
    ]);
  });

  it('un evento inventado no se envía aunque se parezca a uno real', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({ tipo: 'diario.contenido' } as unknown as EventoAnalitica);
    await servicio.registrar({ tipo: 'pantalla.abiertas' } as unknown as EventoAnalitica);

    expect(enviados).toHaveLength(0);
  });

  it('una pantalla que no está en la lista no se envía', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({
      tipo: 'pantalla.abierta',
      pantalla: 'confesiones',
    } as unknown as EventoAnalitica);

    expect(enviados).toHaveLength(0);
  });
});

describe('el código de error es el único campo de texto, y está acotado', () => {
  it('un código de verdad pasa', () => {
    expect(esCodigoMedible('SOBRE_INVALIDO')).toBe(true);
    expect(esCodigoMedible('ERROR_429')).toBe(true);
  });

  it('una frase escrita por una persona no', () => {
    // La forma del valor es el filtro. Ninguna frase la cumple, y es lo que
    // impide que el único campo de tipo cadena sirva de rendija.
    expect(esCodigoMedible(CONFESION)).toBe(false);
    expect(esCodigoMedible(NOMBRE_EN_PETICION)).toBe(false);
    expect(esCodigoMedible('Gratitud de hoy')).toBe(false);
  });

  it('ni en minúsculas, ni con espacios, ni interminable', () => {
    expect(esCodigoMedible('sobre_invalido')).toBe(false);
    expect(esCodigoMedible('SOBRE INVALIDO')).toBe(false);
    expect(esCodigoMedible('AB')).toBe(false);
    expect(esCodigoMedible('A'.repeat(41))).toBe(false);
  });

  it('un error con un código no medible no se envía', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({
      tipo: 'error.ocurrido',
      codigo: CONFESION,
      categoria: 'cifrado',
      puedeReintentarse: false,
    });

    expect(enviados).toHaveLength(0);
  });

  it('el registro seguro de un ErrorApp sí se puede medir', async () => {
    // La ruta de verdad: lo que se mide viene de `aRegistroSeguro`, que ya
    // está pensado para telemetría y no lleva el mensaje.
    const error = new ErrorApp({
      codigo: 'DESCIFRADO_FALLIDO',
      categoria: 'cifrado',
      claveMensaje: 'errores.cifrado.descifradoFallido',
      puedeReintentarse: false,
    });
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    const seguro = error.aRegistroSeguro();
    const enviado = await servicio.registrar({
      tipo: 'error.ocurrido',
      codigo: String(seguro.codigo),
      categoria: 'cifrado',
      puedeReintentarse: Boolean(seguro.puedeReintentarse),
    });

    expect(enviado).toBe(true);
    // La clave del mensaje no viaja: no dice nada privado, pero tampoco hace
    // falta, y lo que no hace falta no sale.
    expect(JSON.stringify(enviados)).not.toContain('claveMensaje');
  });
});

describe('campos de más', () => {
  it('un evento correcto con un campo extra se rechaza entero', async () => {
    // No se limpia el campo y se envía el resto: se rechaza. Limpiar dejaría
    // pasar el siguiente campo que nadie hubiera previsto, y aquí lo barato
    // es perder una medida.
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({
      tipo: 'sesion.terminada',
      segundos: 120,
      ultimaEntrada: CONFESION,
    } as unknown as EventoAnalitica);

    expect(enviados).toHaveLength(0);
  });

  it('los números tienen que ser números sanos', async () => {
    const { servicio, enviados } = montar();
    await servicio.consentir(true);

    await servicio.registrar({ tipo: 'sesion.terminada', segundos: -1 });
    await servicio.registrar({ tipo: 'sesion.terminada', segundos: Number.NaN });
    await servicio.registrar({ tipo: 'sesion.terminada', segundos: Number.POSITIVE_INFINITY });

    expect(enviados).toHaveLength(0);
  });
});

describe('la analítica no rompe la aplicación', () => {
  it('un proveedor que falla no lanza', async () => {
    // Que no se pueda contar una pantalla no es motivo para que alguien no
    // pueda escribir en su diario.
    const { servicio } = montar({ fallaElEnvio: true });
    await servicio.consentir(true);

    await expect(servicio.registrar({ tipo: 'sesion.iniciada' })).resolves.toBe(false);
  });

  it('sin proveedor configurado tampoco', async () => {
    const servicio = crearServicioAnalitica({ contexto: CONTEXTO });
    await servicio.consentir(true);

    await expect(servicio.registrar({ tipo: 'sesion.iniciada' })).resolves.toBeDefined();
    await expect(analiticaNoDisponible.olvidar()).resolves.toBeUndefined();
  });
});

describe('el vocabulario es cerrado', () => {
  it('todos los eventos declarados se aceptan', () => {
    // Sin esto, una lista de tipos que se desincronizara de la unión pasaría
    // desapercibida: la prueba de que algo no pasa siempre está en verde.
    const ejemplos: readonly EventoAnalitica[] = [
      { tipo: 'sesion.iniciada' },
      { tipo: 'sesion.terminada', segundos: 30 },
      { tipo: 'pantalla.abierta', pantalla: 'inicio' },
      { tipo: 'funcion.usada', funcion: 'habito.registrar' },
      { tipo: 'rendimiento.medido', operacion: 'inicio-frio', milisegundos: 1800 },
      {
        tipo: 'error.ocurrido',
        codigo: 'RED_CAIDA',
        categoria: 'conectividad',
        puedeReintentarse: true,
      },
      { tipo: 'sincronizacion.fallida', codigo: 'CONFLICTO', pendientes: 3 },
      { tipo: 'suscripcion.paso', paso: 'compra-completada' },
    ];

    for (const evento of ejemplos) {
      expect(esEventoPermitido(evento)).toBe(true);
    }
    expect(ejemplos.map((e) => e.tipo).sort()).toEqual([...TIPOS_EVENTO].sort());
  });

  it('todas las pantallas y funciones declaradas se aceptan', () => {
    for (const pantalla of PANTALLAS) {
      expect(esEventoPermitido({ tipo: 'pantalla.abierta', pantalla })).toBe(true);
    }
    for (const funcion of FUNCIONES) {
      expect(esEventoPermitido({ tipo: 'funcion.usada', funcion })).toBe(true);
    }
  });

  it('lo que no es un objeto no es un evento', () => {
    expect(esEventoPermitido(null)).toBe(false);
    expect(esEventoPermitido(CONFESION)).toBe(false);
    expect(esEventoPermitido(42)).toBe(false);
    expect(esEventoPermitido(undefined)).toBe(false);
  });
});
