import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservationInboxPanel } from './ReservationInboxPanel.js';
describe('reservation inbox', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts the targeted invitation with CSRF, explains conflicting declines and shows capture honestly', async () => {
    let accepted = false;
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        accepted = true;
        return new Response(JSON.stringify({ state: 'accepted' }), {
          status: 201,
        });
      }
      return new Response(
        JSON.stringify({
          invitations: [
            {
              id: 'invitation',
              pointName: 'Praça de teste',
              date: '2026-11-10',
              startHour: 8,
              duration: 2,
              state: accepted ? 'accepted' : 'pending',
            },
          ],
          notices: [
            {
              id: 'notice',
              message: 'Convite recebido.',
              readAt: '2026-10-16T12:00:00Z',
              mailState: 'captured',
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <ReservationInboxPanel
        context={{
          congregationId: 'test',
          csrfToken: 'csrf',
          canManage: false,
        }}
      />,
    );
    await user.click(
      await screen.findByRole('button', { name: 'Aceitar convite' }),
    );
    expect(
      await screen.findByText(
        'Convite aceito. Convites conflitantes foram recusados automaticamente.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/2 hora\(s\) · Aceito/)).toBeInTheDocument();
    expect(
      screen.getByText('E-mail em captura de teste; sem entrega externa.'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/test/reservation-invitations/invitation/accept',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-csrf-token': 'csrf' },
      }),
    );
  });
});
