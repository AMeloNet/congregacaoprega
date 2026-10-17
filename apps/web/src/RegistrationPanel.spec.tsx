import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RegistrationPanel, ApproveCodePanel } from './RegistrationPanel.js';

it('shows a stable registration code without congregation access and approves it only through the local administrative endpoint', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === '/api/registration' && !options?.method)
      return new Response('null');
    if (url === '/api/registration')
      return new Response(
        JSON.stringify({
          code: 'AB12CD34EF',
          displayName: 'Example',
          phone: '11999990000',
        }),
      );
    return new Response(
      JSON.stringify({ approved: true, displayName: 'Example' }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  try {
    const view = render(
      <RegistrationPanel csrfToken="test-csrf" email="example@example.test" />,
    );
    await user.type(await screen.findByLabelText('Nome completo'), 'Example');
    await user.type(screen.getByLabelText('Telefone'), '11999990000');
    await user.click(screen.getByRole('button', { name: 'Gerar meu código' }));
    expect(await screen.findByText('AB12CD34EF')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Menu' }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/registration',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf' }),
        body: JSON.stringify({ displayName: 'Example', phone: '11999990000' }),
      }),
    );
    view.unmount();
    const onApproved = vi.fn();
    render(
      <ApproveCodePanel
        context={{
          congregationId: 'test',
          canManage: true,
          csrfToken: 'test-csrf',
        }}
        onApproved={onApproved}
      />,
    );
    await user.click(
      screen.getByText('Adicionar publicador pelo código', {
        selector: 'summary',
      }),
    );
    await user.type(
      screen.getByLabelText('Código do publicador'),
      'ab12cd34ef',
    );
    await user.click(screen.getByRole('button', { name: 'Liberar acesso' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledOnce());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Acesso liberado para Example.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/test/approve-code',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf' }),
        body: JSON.stringify({ code: 'AB12CD34EF' }),
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
