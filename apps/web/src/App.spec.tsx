import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { App } from './App.js';

describe('project status page', () => {
  it('identifies the project and the current technical stage', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'congregacaoprega' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Base técnica em preparação')).toBeInTheDocument();
  });

  it('explains that a failed connection cannot confirm the current status', async () => {
    const request = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network offline'));

    render(<App />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Verificar conexão' }),
    );

    expect(
      await screen.findByText('Sem conexão com o servidor. Tente novamente.'),
    ).toBeInTheDocument();
    request.mockRestore();
  });
});
