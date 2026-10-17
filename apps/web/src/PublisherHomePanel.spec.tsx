import { render, screen, within } from '@testing-library/react';
import { PublisherHomePanel } from './PublisherHomePanel.js';

describe('publisher home', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows pending invitations before only the signed-in publisher assignments and their group', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/reservation-inbox'))
          return new Response(
            JSON.stringify({
              invitations: [
                {
                  id: 'invite',
                  date: '2026-10-20',
                  startHour: 16,
                  duration: 2,
                  pointName: 'Largo do Sol',
                  state: 'pending',
                },
              ],
            }),
          );
        if (url.endsWith('/schedule'))
          return new Response(
            JSON.stringify({
              reservations: [
                {
                  id: 'mine',
                  date: '2026-10-17',
                  startHour: 8,
                  duration: 2,
                  pointName: 'Praça Central',
                  isResponsible: true,
                },
                {
                  id: 'other',
                  date: '2026-10-18',
                  startHour: 8,
                  duration: 2,
                  pointName: 'Outro ponto',
                  isResponsible: false,
                  isParticipant: false,
                },
              ],
            }),
          );
        return new Response(
          JSON.stringify({
            id: 'mine',
            participants: [
              { accountId: 'owner', position: 1, name: 'Ana' },
              { accountId: 'member', position: 2, name: 'Marina' },
            ],
          }),
        );
      }),
    );

    render(
      <PublisherHomePanel
        context={{
          congregationId: 'test',
          csrfToken: 'csrf',
          canManage: false,
        }}
        onNavigate={() => {}}
      />,
    );

    const invitation = await screen.findByRole('heading', {
      name: 'Seus convites',
    });
    const assignments = screen.getByRole('heading', {
      name: 'Suas designações',
    });
    expect(
      invitation.compareDocumentPosition(assignments) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const assignment = screen.getByText('Praça Central').closest('article');
    expect(assignment).not.toBeNull();
    expect(within(assignment!).getByText('Responsável:')).toBeInTheDocument();
    expect(within(assignment!).getByText('Ana')).toBeInTheDocument();
    expect(within(assignment!).getByText('Marina')).toBeInTheDocument();
    expect(screen.queryByText('Outro ponto')).not.toBeInTheDocument();
  });
});
