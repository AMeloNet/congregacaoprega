import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AccessApp } from './AccessApp.js';

describe('IDN-001C access interface', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows login when there is no session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authenticated: false }), {
            status: 200,
          }),
      ),
    );
    render(<AccessApp />);
    expect(
      await screen.findByRole('heading', { name: 'Acesse sua congregação' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Entrar com e-mail' }),
    ).toHaveAttribute('href', '/api/auth/login');
    expect(
      screen.getByRole('link', { name: 'Recuperar senha' }),
    ).toHaveAttribute('href', '/api/auth/recover');
  });

  it('explains unverified and unlinked states', async () => {
    const responses = [
      { authenticated: true, emailVerified: false, memberships: [] },
      { authenticated: true, emailVerified: true, memberships: [] },
    ];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responses.shift()), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const first = render(<AccessApp />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Confirme seu e-mail',
    );
    first.unmount();
    render(<AccessApp />);
    expect(
      await screen.findByText(/Você ainda não possui vínculo ativo/),
    ).toBeInTheDocument();
  });

  it('selects only an authorized active congregation through the API', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            emailVerified: true,
            csrfToken: 'csrf',
            activeCongregationId: 'cong-a',
            memberships: [
              {
                congregationId: 'cong-a',
                congregationName: 'Congregação A',
                role: 'PUBLISHER',
              },
              {
                congregationId: 'cong-b',
                congregationName: 'Congregação B',
                role: 'LOCAL_ADMIN',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccessApp />);

    const select = await screen.findByRole('combobox', {
      name: 'Congregação ativa',
    });
    await user.selectOptions(select, 'cong-b');
    expect(fetchMock).toHaveBeenLastCalledWith('/api/session/congregation', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf' },
      body: JSON.stringify({ congregationId: 'cong-b' }),
    });
    expect(screen.getByText('Administrador local')).toBeInTheDocument();
  });

  it('accepts an invitation and sends a publisher invitation through the backend', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            emailVerified: true,
            csrfToken: 'csrf',
            activeCongregationId: 'cong-a',
            memberships: [
              {
                congregationId: 'cong-a',
                congregationName: 'Congregação A',
                role: 'LOCAL_ADMIN',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccessApp invitationToken="invite-token" />);

    await user.click(
      await screen.findByRole('button', { name: 'Aceitar convite' }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/invitations/invite-token/accept',
      {
        method: 'POST',
        headers: { 'x-csrf-token': 'csrf' },
      },
    );
    await user.type(
      screen.getByRole('textbox', { name: 'E-mail do novo publicador' }),
      'novo@example.test',
    );
    await user.click(screen.getByRole('button', { name: 'Enviar convite' }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/cong-a/invitations/publisher',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf' },
        body: JSON.stringify({ email: 'novo@example.test' }),
      },
    );
  });

  it('lets the master invite a local administrator without granting business membership', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            emailVerified: true,
            isMaster: true,
            csrfToken: 'csrf',
            memberships: [],
            adminCongregations: [
              { id: 'cong-a', name: 'Congregação A' },
              { id: 'cong-b', name: 'Congregação B' },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccessApp />);

    await user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Congregação para administrar',
      }),
      'cong-b',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'E-mail do administrador local' }),
      'admin@example.test',
    );
    await user.click(
      screen.getByRole('button', { name: 'Enviar convite de administrador' }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/congregations/cong-b/invitations/admin',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf' },
        body: JSON.stringify({ email: 'admin@example.test' }),
      },
    );
  });

  it('lets a local administrator consult and revoke a publisher membership', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            authenticated: true,
            emailVerified: true,
            csrfToken: 'csrf',
            activeCongregationId: 'cong-a',
            memberships: [
              {
                congregationId: 'cong-a',
                congregationName: 'Congregação A',
                role: 'LOCAL_ADMIN',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 'publisher-membership',
              email: 'publisher@example.test',
              role: 'PUBLISHER',
              status: 'ACTIVE',
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AccessApp />);

    await user.click(
      await screen.findByRole('button', { name: 'Consultar vínculos' }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Revogar publisher@example.test',
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/memberships/publisher-membership/revoke',
      { method: 'POST', headers: { 'x-csrf-token': 'csrf' } },
    );
    expect(screen.getByText('Revogado')).toBeInTheDocument();
  });
});
