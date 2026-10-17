import { useEffect, useState, type FormEvent } from 'react';

type Item = {
  id: string;
  name: string;
  type: 'CART' | 'KIOSK' | 'DISPLAY';
  active: boolean;
  observation: string;
};
const labels = { CART: 'Carrinho', KIOSK: 'Quiosque', DISPLAY: 'Display' };
export type EquipmentContext = {
  congregationId: string;
  congregationName?: string;
  csrfToken: string;
  canManage: boolean;
};

export function EquipmentPanel({ context }: { context: EquipmentContext }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('CART');
  const [observation, setObservation] = useState('');
  const [editing, setEditing] = useState<Item | null>(null);
  const [reason, setReason] = useState('');
  const url = `/api/congregations/${encodeURIComponent(context.congregationId)}/equipment`;
  async function load(signal?: AbortSignal) {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error('Não foi possível carregar os equipamentos.');
    setItems((await response.json()) as Item[]);
  }
  useEffect(() => {
    if (!context.canManage) return;
    const controller = new AbortController();
    void load(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar os equipamentos.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, context.canManage]);

  async function save(event: FormEvent, changeState: boolean) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(
        changeState ? `${url}/${editing!.id}/state` : url,
        {
          method: changeState ? 'PATCH' : 'POST',
          headers: {
            'content-type': 'application/json',
            'x-csrf-token': context.csrfToken,
          },
          body: JSON.stringify(
            changeState
              ? { active: !editing!.active, observation: reason }
              : { name, type, observation },
          ),
        },
      );
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(
          typeof body.message === 'string'
            ? body.message
            : 'Não foi possível salvar.',
        );
      }
      if (changeState) {
        setEditing(null);
        setReason('');
      } else {
        setName('');
        setObservation('');
      }
      setMessage('Equipamento salvo.');
      await load();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível conectar ao servidor.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!context.canManage)
    return (
      <section className="panel">
        <h2>Equipamentos</h2>
        <p>Acesso restrito ao administrador local.</p>
      </section>
    );
  return (
    <section
      className="panel equipment-panel"
      aria-label="Equipamentos da congregação"
    >
      <p className="eyebrow">INVENTÁRIO DA CONGREGAÇÃO</p>
      <h2>Equipamentos</h2>
      {error && (
        <p className="feedback error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="feedback success" role="status">
          {message}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando equipamentos…</p>
      ) : items.length === 0 ? (
        <p>Nenhum equipamento cadastrado.</p>
      ) : (
        <ul className="equipment-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong>
              <span>
                {labels[item.type]} · {item.active ? 'Ativo' : 'Inativo'}
              </span>
              {item.observation && <p>{item.observation}</p>}
              <button
                className="button outline"
                disabled={busy}
                onClick={() => {
                  setEditing(item);
                  setReason('');
                }}
              >
                {item.active ? 'Inativar' : 'Reativar'} {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setError('');
            void load()
              .catch(() =>
                setError('Não foi possível carregar os equipamentos.'),
              )
              .finally(() => setLoading(false));
          }}
        >
          Tentar carregar novamente
        </button>
      )}
      {editing && (
        <form onSubmit={(event) => void save(event, true)}>
          <h3>
            {editing.active ? 'Inativar' : 'Reativar'} {editing.name}
          </h3>
          <label htmlFor="equipment-reason">
            Observação da mudança (opcional)
          </label>
          <textarea
            id="equipment-reason"
            maxLength={250}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="panel-actions">
            <button className="button" disabled={busy}>
              Confirmar mudança
            </button>
            <button
              className="button outline"
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <form onSubmit={(event) => void save(event, false)}>
        <h3>Cadastrar equipamento</h3>
        <label htmlFor="equipment-name">Nome da unidade</label>
        <input
          id="equipment-name"
          required
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <label htmlFor="equipment-type">Tipo</label>
        <select
          id="equipment-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <label htmlFor="equipment-observation">Observação (opcional)</label>
        <textarea
          id="equipment-observation"
          maxLength={250}
          value={observation}
          onChange={(event) => setObservation(event.target.value)}
        />
        <button className="button" disabled={busy}>
          {busy ? 'Salvando…' : 'Cadastrar equipamento'}
        </button>
      </form>
    </section>
  );
}
