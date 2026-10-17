import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScheduleReportPanel } from './ScheduleReportPanel.js';
describe('report finalization interface', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('prints only after receiving and rendering the persisted version and reprints without another mutation', async () => {
    const snapshot = {
      title: 'Testemunho Público',
      congregationName: 'Congregação Teste',
      timezone: 'America/Sao_Paulo',
      month: '2026-10',
      entries: [],
    };
    const emitted = {
      id: 'report',
      version: 1,
      createdAt: '2026-10-16T12:00:00Z',
      snapshot,
    };
    let finalized = false;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') {
        finalized = true;
        return new Response(JSON.stringify(emitted), { status: 201 });
      }
      if (url.endsWith('/schedule'))
        return new Response(JSON.stringify({ months: [{ month: '2026-10' }] }));
      if (url.endsWith('/report-preview'))
        return new Response(
          JSON.stringify({
            draft: true,
            state: 'open',
            snapshot,
            missingNames: [],
            reports: [],
          }),
        );
      return new Response(JSON.stringify(emitted));
    });
    vi.stubGlobal('fetch', fetchMock);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      expect(finalized).toBe(true);
      expect(
        screen.getByLabelText('Versão emitida do relatório'),
      ).toHaveTextContent('Versão 1');
    });
    const user = userEvent.setup();
    render(
      <ScheduleReportPanel
        context={{ congregationId: 'test', csrfToken: 'csrf', canManage: true }}
      />,
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Finalizar e imprimir',
      }),
    );
    expect(print).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent(
      'mesmo se a impressão for cancelada',
    );
    await user.click(
      screen.getByRole('button', { name: 'Reimprimir versão 1' }),
    );
    expect(print).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/congregations/test/schedule/2026-10/finalize-print',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-csrf-token': 'csrf' }),
      }),
    );
  });
});
