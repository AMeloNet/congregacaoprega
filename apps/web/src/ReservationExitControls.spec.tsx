import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservationExitControls } from './ReservationExitControls.js';
describe('reservation exit choices', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('requires an explicit cancellation scope and sends withdrawal as a separate self action with CSRF', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const saved = vi.fn(),
      context = { congregationId: 'test', csrfToken: 'csrf', canManage: false },
      user = userEvent.setup();
    const view = render(
      <ReservationExitControls
        context={context}
        reservationId="reservation"
        series
        canCancel
        canLeave={false}
        onSaved={saved}
      />,
    );
    await user.click(screen.getByText('Cancelar reserva'));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await user.selectOptions(
      screen.getByLabelText('O que deseja cancelar?'),
      'following',
    );
    await user.click(
      screen.getByRole('button', { name: 'Confirmar cancelamento' }),
    );
    expect(saved).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      '/api/congregations/test/reservations/reservation/cancel',
    );
    expect(JSON.parse(call[1].body as string)).toEqual({
      requestKey: expect.any(String),
      scope: 'following',
    });
    view.rerender(
      <ReservationExitControls
        context={context}
        reservationId="another"
        series={false}
        canCancel={false}
        canLeave
        onSaved={saved}
      />,
    );
    await user.click(screen.getByText('Desistir da participação'));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar desistência' }),
    );
    const leave = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(leave[0]).toBe('/api/congregations/test/reservations/another/leave');
    expect(JSON.parse(leave[1].body as string)).toEqual({
      requestKey: expect.any(String),
    });
    expect(leave[1].headers).toEqual({
      'x-csrf-token': 'csrf',
      'content-type': 'application/json',
    });
  });
});
