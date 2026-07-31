// La pantalla más delicada del alta: si deja pasar a alguien que no ha
// guardado la frase, ese usuario perderá su contenido privado sin remedio.
import { fireEvent, screen } from '@testing-library/react-native';

import { renderizar } from '@shared/testing/renderizar';

import { PantallaFraseRecuperacion } from '../PantallaFraseRecuperacion';

// Frase ficticia con palabras distinguibles por posición.
const FRASE = Array.from({ length: 24 }, (_, i) => `palabra${i + 1}`).join(' ');

function montar(alConfirmar = jest.fn()) {
  renderizar(<PantallaFraseRecuperacion frase={FRASE} alConfirmar={alConfirmar} />);
  return { alConfirmar };
}

/** Lee del texto de la etiqueta qué posición pide cada campo. */
function posicionesPedidas(): number[] {
  return screen
    .getAllByText(/^Palabra \d+$/)
    .map((nodo) => Number(String(nodo.props.children).replace(/\D/g, '')));
}

describe('paso de mostrar la frase', () => {
  it('muestra las 24 palabras y avisa de que nadie puede recuperarlas', () => {
    montar();

    expect(screen.getByText('palabra1')).toBeTruthy();
    expect(screen.getByText('palabra24')).toBeTruthy();
    expect(screen.getByText(/Nadie más puede recuperarlas/)).toBeTruthy();
    expect(screen.getByText(/No hagas una captura de pantalla/)).toBeTruthy();
  });

  it('no ofrece continuar sin pasar por la verificación', () => {
    const { alConfirmar } = montar();

    fireEvent.press(screen.getByRole('button', { name: 'Ya las he guardado' }));

    expect(alConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText('Confirmemos que las tienes')).toBeTruthy();
  });
});

describe('paso de verificación', () => {
  function irAVerificacion() {
    fireEvent.press(screen.getByRole('button', { name: 'Ya las he guardado' }));
  }

  it('pide confirmar tres palabras', () => {
    montar();
    irAVerificacion();

    expect(posicionesPedidas()).toHaveLength(3);
  });

  it('el botón de continuar está deshabilitado hasta que todo coincide', () => {
    const { alConfirmar } = montar();
    irAVerificacion();

    const continuar = screen.getByRole('button', { name: 'Continuar' });
    expect(continuar.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(continuar);
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it('avisa de la palabra incorrecta sin esperar a que se pulse continuar', () => {
    const { alConfirmar } = montar();
    irAVerificacion();

    // El botón está deshabilitado mientras haya un fallo, así que el aviso
    // no puede depender de pulsarlo: aparece al salir del campo.
    const [primera] = posicionesPedidas();
    const campo = screen.getByLabelText(`Palabra ${primera}`);
    fireEvent.changeText(campo, 'equivocada');
    fireEvent(campo, 'blur');

    expect(screen.getByText('Esta palabra no coincide. Revisa tu anotación.')).toBeTruthy();
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it('el aviso desaparece al corregir la palabra', () => {
    montar();
    irAVerificacion();

    const [primera] = posicionesPedidas();
    const campo = screen.getByLabelText(`Palabra ${primera}`);
    fireEvent.changeText(campo, 'equivocada');
    fireEvent(campo, 'blur');
    fireEvent.changeText(campo, `palabra${primera}`);

    expect(screen.queryByText('Esta palabra no coincide. Revisa tu anotación.')).toBeNull();
  });

  it('confirma cuando las tres palabras son correctas', () => {
    const { alConfirmar } = montar();
    irAVerificacion();

    posicionesPedidas().forEach((numero) => {
      fireEvent.changeText(screen.getByLabelText(`Palabra ${numero}`), `palabra${numero}`);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it('acepta las palabras aunque se escriban con mayúsculas o espacios', () => {
    const { alConfirmar } = montar();
    irAVerificacion();

    posicionesPedidas().forEach((numero) => {
      fireEvent.changeText(screen.getByLabelText(`Palabra ${numero}`), `  PALABRA${numero} `);
    });

    fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

    expect(alConfirmar).toHaveBeenCalledTimes(1);
  });

  it('permite volver a ver la frase si el usuario no la anotó bien', () => {
    montar();
    irAVerificacion();

    fireEvent.press(screen.getByRole('button', { name: 'Ver mis palabras otra vez' }));

    expect(screen.getByText('palabra1')).toBeTruthy();
  });
});
