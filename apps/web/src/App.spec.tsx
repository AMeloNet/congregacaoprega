import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from './App.js';

beforeEach(() => {
  window.location.hash = '#inicio';
});

describe('UI-001 prototype journeys', () => {
  it('marks the demo and navigates to every proposed screen', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/dados fictícios/i)).toBeInTheDocument();

    for (const name of [
      'Programação',
      'Nova reserva',
      'Convites e avisos',
      'Administração',
      'Recursos',
      'Relatório',
      'Início',
    ]) {
      await user.click(screen.getByRole('link', { name }));
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });

  it('creates a fictional reservation and refuses an unavailable slot', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Nova reserva' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Horário' }),
      '08:00–10:00',
    );
    await user.click(screen.getByRole('button', { name: 'Revisar reserva' }));
    expect(screen.getByRole('alert')).toHaveTextContent('indisponível');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Horário' }),
      '10:00–12:00',
    );
    await user.click(screen.getByRole('button', { name: 'Revisar reserva' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar reserva simulada' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Reserva simulada criada',
    );
    expect(
      screen.getByRole('heading', { name: 'Detalhe da reserva' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('positions')).getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  it('accepts a pending invitation, rejects an expired one and resets the demo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Convites e avisos' }));
    const expired = screen.getByText('Convite expirado').closest('article');
    expect(expired).not.toBeNull();
    expect(
      within(expired!).getByRole('button', { name: 'Aceitar convite' }),
    ).toBeDisabled();
    const pending = screen.getByText('Convite pendente').closest('article');
    expect(pending).not.toBeNull();
    await user.click(
      within(pending!).getByRole('button', { name: 'Aceitar convite' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Convite aceito');
    await user.click(
      screen.getByRole('button', { name: 'Restaurar demonstração' }),
    );
    expect(screen.getByText('Convite pendente')).toBeInTheDocument();
  });

  it('blocks publisher actions after finalization and versions the printable report', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    render(<App />);
    await user.click(
      screen.getByRole('button', { name: 'Ver como administrador' }),
    );
    await user.click(screen.getByRole('link', { name: 'Administração' }));
    await user.click(
      screen.getByRole('button', { name: 'Finalizar e imprimir' }),
    );
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Versão 1').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('link', { name: 'Administração' }));
    await user.click(
      screen.getByRole('button', { name: 'Reabrir para ajustes' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Adicionar participante fictício' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Finalizar e imprimir' }),
    );
    expect(screen.getAllByText('Versão 2').length).toBeGreaterThan(0);
    expect(screen.getByText('Teresa; Joaquim')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Ver como publicador' }),
    );
    await user.click(screen.getByRole('link', { name: 'Nova reserva' }));
    expect(
      screen.getByRole('button', { name: 'Revisar reserva' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Mês finalizado: publicadores não podem alterar designações.',
      ),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows a cancelled reservation consistently in the schedule and report', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Detalhe da reserva' }));
    await user.click(
      screen.getByRole('button', { name: 'Bloquear terceira vaga' }),
    );
    expect(screen.getByText('Vaga bloqueada')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Cancelar reserva simulada' }),
    );
    expect(
      within(screen.getByTestId('positions')).getAllByText('Posição liberada'),
    ).toHaveLength(3);
    await user.click(screen.getByRole('link', { name: 'Programação' }));
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Relatório' }));
    expect(screen.queryByText('Ana; Marina')).not.toBeInTheDocument();
  });
});
