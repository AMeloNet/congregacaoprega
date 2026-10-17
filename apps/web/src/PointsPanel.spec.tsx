import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointsPanel } from './PointsPanel.js';

describe('points interface', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('creates and edits through the congregation API with CSRF and restricts access', async () => {
    const user = userEvent.setup();
    let item: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method) {
        item = { id: 'point', ...JSON.parse(options.body as string) };
        return new Response(JSON.stringify(item));
      }
      return new Response(JSON.stringify(item ? [item] : []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const context = {
      congregationId: 'test',
      csrfToken: 'test-csrf',
      canManage: true,
    };
    const view = render(<PointsPanel context={context} />);
    expect(
      await screen.findByText('Nenhum ponto cadastrado.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nome do ponto')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Novo ponto' }));
    const upload = screen.getByLabelText('Foto do ponto (opcional, até 20 MB)');
    const oversized = new File(['example'], 'oversized.png', {
      type: 'image/png',
    });
    Object.defineProperty(oversized, 'size', { value: 20 * 1024 * 1024 + 1 });
    await user.upload(upload, oversized);
    expect(screen.getByRole('alert')).toHaveTextContent('até 20 MB');
    const allowed = new File(['example'], 'allowed.png', { type: 'image/png' });
    Object.defineProperty(allowed, 'size', { value: 20 * 1024 * 1024 });
    await user.upload(upload, allowed);
    expect(
      await screen.findByRole('img', { name: 'Prévia da foto do ponto' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Grupos simultâneos')).toHaveValue(1);
    await user.type(screen.getByLabelText('Nome do ponto'), 'Test point');
    await user.type(
      screen.getByLabelText('Endereço (opcional)'),
      'Test street',
    );
    await user.click(screen.getByLabelText('Carrinho'));
    await user.click(screen.getByRole('button', { name: 'Cadastrar ponto' }));
    await user.click(
      await screen.findByRole('button', { name: 'Ver detalhes de Test point' }),
    );
    await user.click(screen.getByRole('button', { name: 'Editar Test point' }));
    await user.clear(screen.getByLabelText('Grupos simultâneos'));
    await user.type(screen.getByLabelText('Grupos simultâneos'), '2');
    await user.click(screen.getByRole('button', { name: 'Salvar ponto' }));
    expect(
      await screen.findByText('Grupos simultâneos: 2'),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/test/points/point',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf' }),
      }),
    );
    view.unmount();
    fetchMock.mockClear();
    render(<PointsPanel context={{ ...context, canManage: false }} />);
    expect(
      screen.getByText('Acesso restrito ao administrador local.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
