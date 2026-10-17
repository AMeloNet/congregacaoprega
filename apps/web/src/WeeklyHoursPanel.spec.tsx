import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeeklyHoursPanel } from './WeeklyHoursPanel.js';

describe('point weekly hours interface', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('selects a point, saves only its weekly hours and loads another point independently', async () => {
    const user = userEvent.setup();
    const configuration = () => ({
      timezone: 'America/Sao_Paulo',
      timezoneVersion: 0,
      version: 0,
      days: Array.from({ length: 7 }, (_, day) => ({
        day,
        mode: 'unrestricted',
        intervals: [] as { start: string; end: string }[],
      })),
    });
    const first = configuration();
    const second = configuration();
    let saved: unknown;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/points'))
        return new Response(
          JSON.stringify([
            { id: 'first', name: 'Feira de Sábado' },
            { id: 'second', name: 'Praça' },
          ]),
        );
      if (options?.method === 'PUT') {
        saved = JSON.parse(options.body as string);
        return new Response(
          JSON.stringify({ ...(saved as object), version: 1 }),
        );
      }
      return new Response(
        JSON.stringify(url.includes('/first/') ? first : second),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const context = {
      congregationId: 'congregation',
      csrfToken: 'csrf',
      canManage: true,
    };
    const view = render(<WeeklyHoursPanel context={context} />);
    expect(
      await screen.findByRole('heading', { name: 'Feira de Sábado' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Salvar horários semanais' }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Ver horários de Feira de Sábado' }),
    );
    await screen.findByRole('button', { name: 'Salvar horários semanais' });
    for (const day of [
      'Domingo',
      'Segunda-feira',
      'Terça-feira',
      'Quarta-feira',
      'Quinta-feira',
      'Sexta-feira',
    ])
      await user.selectOptions(
        screen.getByLabelText(`Disponibilidade — ${day}`),
        'closed',
      );
    await user.selectOptions(
      screen.getByLabelText('Disponibilidade — Sábado'),
      'intervals',
    );
    await user.clear(screen.getByLabelText('Início 1 — Sábado'));
    await user.type(screen.getByLabelText('Início 1 — Sábado'), '06:00');
    await user.clear(screen.getByLabelText('Fim 1 — Sábado'));
    await user.type(screen.getByLabelText('Fim 1 — Sábado'), '14:00');
    await user.click(
      screen.getByRole('button', { name: 'Salvar horários semanais' }),
    );
    await screen.findByText('Horários semanais salvos.');
    expect(saved).toMatchObject({
      days: [
        ...Array.from({ length: 6 }, (_, day) => ({
          day,
          mode: 'closed',
          intervals: [],
        })),
        {
          day: 6,
          mode: 'intervals',
          intervals: [{ start: '06:00', end: '14:00' }],
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/congregation/points/first/weekly-hours',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf' }),
      }),
    );
    await user.selectOptions(
      screen.getByLabelText('Local dos horários semanais'),
      'second',
    );
    await screen.findByRole('heading', { name: 'Praça' });
    await waitFor(() =>
      expect(screen.getByLabelText('Disponibilidade — Sábado')).toHaveValue(
        'unrestricted',
      ),
    );
    expect(
      screen.queryByLabelText('Início 1 — Sábado'),
    ).not.toBeInTheDocument();
    view.unmount();
    fetchMock.mockClear();
    render(<WeeklyHoursPanel context={{ ...context, canManage: false }} />);
    expect(
      screen.getByText('Acesso restrito ao administrador local.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
