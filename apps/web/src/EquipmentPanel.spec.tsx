import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EquipmentPanel } from './EquipmentPanel.js';

describe('equipment interface', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads, registers and changes a unit using the congregation API and CSRF', async () => {
    const user = userEvent.setup();
    const item = {
      id: 'unit',
      name: 'Test cart',
      type: 'CART',
      active: true,
      observation: '',
    };
    let created = false;
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        created = true;
        return new Response(JSON.stringify(item), { status: 201 });
      }
      if (options?.method === 'PATCH') {
        item.active = false;
        item.observation = 'Maintenance';
        return new Response(JSON.stringify(item));
      }
      return new Response(JSON.stringify(created ? [item] : []));
    });
    vi.stubGlobal('fetch', fetchMock);
    const view = render(
      <EquipmentPanel
        context={{
          congregationId: 'test-congregation',
          csrfToken: 'test-csrf',
          canManage: true,
        }}
      />,
    );
    expect(
      await screen.findByText('Nenhum equipamento cadastrado.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nome da unidade'), 'Test cart');
    await user.click(
      screen.getByRole('button', { name: 'Cadastrar equipamento' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Inativar Test cart' }),
    );
    await user.type(
      screen.getByLabelText('Observação da mudança (opcional)'),
      'Maintenance',
    );
    await user.click(screen.getByRole('button', { name: 'Confirmar mudança' }));
    expect(await screen.findByText('Carrinho · Inativo')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/test-congregation/equipment/unit/state',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'x-csrf-token': 'test-csrf' }),
        body: JSON.stringify({ active: false, observation: 'Maintenance' }),
      }),
    );
    view.unmount();
    fetchMock.mockClear();
    render(
      <EquipmentPanel
        context={{
          congregationId: 'test-congregation',
          csrfToken: 'test-csrf',
          canManage: false,
        }}
      />,
    );
    expect(
      screen.getByText('Acesso restrito ao administrador local.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
