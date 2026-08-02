// El orden de las fases no es cosmético: `lista` monta el contenido privado.
import { useEstadoSesion } from '../estadoSesion';

beforeEach(() => {
  useEstadoSesion.setState({
    fase: 'comprobando',
    usuario: null,
    fraseRecuperacionPendiente: null,
  });
});

const USUARIO = { id: 'usuario-1', correo: 'persona@ejemplo.test' };

describe('preparar la frase de recuperación', () => {
  it('deja el usuario y la frase sin pasar por la fase lista', () => {
    // Antes había que abrir la sesión para dejar el usuario en el estado, y
    // eso montaba el contenido privado durante un instante, antes de que la
    // persona hubiera anotado su frase.
    const fases: string[] = [];
    const quitar = useEstadoSesion.subscribe((estado) => fases.push(estado.fase));

    useEstadoSesion.getState().prepararFrase(USUARIO, 'las veinticuatro palabras', 'dispositivo-1');
    quitar();

    expect(fases).toEqual(['mostrandoFrase']);
    expect(useEstadoSesion.getState().usuario).toEqual(USUARIO);
    expect(useEstadoSesion.getState().fraseRecuperacionPendiente).toBe('las veinticuatro palabras');
  });

  it('confirmar la frase la olvida y abre la sesión', () => {
    useEstadoSesion.getState().prepararFrase(USUARIO, 'frase', 'dispositivo-1');

    useEstadoSesion.getState().confirmarFraseGuardada();

    expect(useEstadoSesion.getState().fase).toBe('lista');
    expect(useEstadoSesion.getState().fraseRecuperacionPendiente).toBeNull();
  });

  it('cerrar sesión olvida al usuario y cualquier frase pendiente', () => {
    useEstadoSesion.getState().prepararFrase(USUARIO, 'frase', 'dispositivo-1');

    useEstadoSesion.getState().cerrarSesion();

    expect(useEstadoSesion.getState().usuario).toBeNull();
    expect(useEstadoSesion.getState().dispositivoId).toBeNull();
    expect(useEstadoSesion.getState().fraseRecuperacionPendiente).toBeNull();
  });
});

describe('dispositivo de la sesión', () => {
  it('el desbloqueo biométrico no pierde el dispositivo dado de alta', () => {
    // Reabrir la sesión tras el bloqueo no vuelve a registrar el dispositivo,
    // así que no puede borrar el identificador con el que se sincroniza.
    useEstadoSesion.getState().abrirSesion(USUARIO, 'dispositivo-1');
    useEstadoSesion.getState().bloquear();

    useEstadoSesion.getState().abrirSesion(USUARIO);

    expect(useEstadoSesion.getState().dispositivoId).toBe('dispositivo-1');
  });
});
