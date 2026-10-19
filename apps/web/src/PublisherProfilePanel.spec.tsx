import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PublisherProfilePanel } from './PublisherProfilePanel.js';

it('presents account fields in one form and saves the selected face photo', async () => {
  const user = userEvent.setup();
  const facePhoto =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
    if (!options?.method)
      return new Response(
        JSON.stringify({
          displayName: 'Example',
          phone: '11999990000',
          email: 'example@example.test',
          facePhoto: '',
        }),
      );
    return new Response(
      JSON.stringify({
        displayName: 'Example',
        phone: '11999990000',
        email: 'example@example.test',
        facePhoto,
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  try {
    render(
      <PublisherProfilePanel
        context={{
          congregationId: 'congregation',
          csrfToken: 'test-csrf',
          canManage: false,
        }}
      />,
    );
    await screen.findByDisplayValue('Example');
    expect(screen.getByLabelText('Seu nome')).toBeInTheDocument();
    expect(screen.getByLabelText('Telefone')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('example@example.test');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    const file = new File(['face'], 'face.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText('Foto Rosto'), file);
    await waitFor(() =>
      expect(
        screen.getByRole('img', { name: 'Prévia da foto de rosto' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/congregations/congregation/publisher-profile',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"facePhoto":"data:image/png;base64,'),
        }),
      ),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
