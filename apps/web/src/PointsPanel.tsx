import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';

type Point = {
  id: string;
  name: string;
  address: string;
  description: string;
  photo?: string;
  capacity: number;
  allowedTypes: string[];
};
const labels: Record<string, string> = {
  CART: 'Carrinho',
  KIOSK: 'Quiosque',
  DISPLAY: 'Display',
};
const empty = () => ({
  photo: '',
  name: '',
  address: '',
  description: '',
  capacity: 1,
  allowedTypes: [] as string[],
});

export function PointsPanel({
  context,
  onChanged,
}: {
  context: EquipmentContext;
  onChanged?: () => void;
}) {
  const [view, setView] = useState<'list' | 'detail' | 'form'>(() =>
    window.location.hash.includes('novo=1') ? 'form' : 'list',
  );
  const [selected, setSelected] = useState<Point | null>(null);
  const [items, setItems] = useState<Point[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const url = `/api/congregations/${encodeURIComponent(context.congregationId)}/points`;
  async function load(signal?: AbortSignal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('Não foi possível carregar os pontos.');
    setItems((await response.json()) as Point[]);
  }
  useEffect(() => {
    if (!context.canManage) return;
    const controller = new AbortController();
    void load(controller.signal)
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar os pontos.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, context.canManage]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.allowedTypes.length) {
      setError('Selecione ao menos um tipo permitido.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(editing ? `${url}/${editing}` : url, {
        method: editing ? 'PUT' : 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': context.csrfToken,
        },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        throw new Error(
          typeof body.message === 'string'
            ? body.message
            : 'Não foi possível salvar o ponto.',
        );
      }
      setForm(empty());
      setEditing(null);
      setView('list');
      setMessage('Ponto salvo.');
      await load();
      onChanged?.();
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
        <h2>Pontos de pregação</h2>
        <p>Acesso restrito ao administrador local.</p>
      </section>
    );
  return (
    <section
      className="panel equipment-panel"
      aria-label="Pontos de pregação da congregação"
    >
      <p className="eyebrow">PONTOS DE PREGAÇÃO</p>
      <h2>Locais</h2>
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
      {view === 'list' && (
        <button
          className="button"
          onClick={() => {
            setEditing(null);
            setForm(empty());
            setView('form');
          }}
        >
          Novo ponto
        </button>
      )}
      {view !== 'list' && (
        <button
          className="button outline"
          disabled={busy}
          onClick={() => setView('list')}
        >
          Voltar à lista de pontos
        </button>
      )}
      {view === 'list' &&
        (loading ? (
          <p role="status">Carregando pontos…</p>
        ) : items.length === 0 ? (
          <p>Nenhum ponto cadastrado.</p>
        ) : (
          <ul className="equipment-list">
            {items.map((item) => (
              <li key={item.id}>
                <strong>{item.name}</strong>
                {item.address && <p>{item.address}</p>}

                <span>Grupos simultâneos: {item.capacity}</span>
                <span>
                  Tipos permitidos:{' '}
                  {item.allowedTypes.map((type) => labels[type]).join(', ')}
                </span>
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => {
                    setSelected(item);
                    setView('detail');
                    setEditing(item.id);
                    setForm({
                      photo: item.photo ?? '',
                      name: item.name,
                      address: item.address,
                      description: item.description,
                      capacity: item.capacity,
                      allowedTypes: [...item.allowedTypes],
                    });
                    setMessage('');
                  }}
                >
                  Ver detalhes de {item.name}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {view === 'detail' && selected && (
        <article className="panel">
          <h3>{selected.name}</h3>
          {selected.photo && (
            <img
              className="point-photo"
              src={selected.photo}
              alt={`Foto de ${selected.name}`}
            />
          )}
          <p>{selected.address}</p>
          <p>{selected.description}</p>
          <p>Grupos simultâneos: {selected.capacity}</p>
          <p>{selected.allowedTypes.map((type) => labels[type]).join(', ')}</p>
          <button className="button" onClick={() => setView('form')}>
            Editar {selected.name}
          </button>
        </article>
      )}
      {error && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            setError('');
            void load()
              .catch(() => setError('Não foi possível carregar os pontos.'))
              .finally(() => setLoading(false));
          }}
        >
          Tentar carregar novamente
        </button>
      )}
      {view === 'form' && (
        <form onSubmit={(event) => void save(event)}>
          <h3>{editing ? 'Editar ponto' : 'Cadastrar ponto'}</h3>
          <label htmlFor="point-name">Nome do ponto</label>
          <input
            id="point-name"
            required
            maxLength={80}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <label htmlFor="point-address">Endereço (opcional)</label>
          <input
            id="point-address"
            maxLength={250}
            value={form.address}
            onChange={(event) =>
              setForm({ ...form, address: event.target.value })
            }
          />
          <label htmlFor="point-description">Descrição (opcional)</label>
          <textarea
            id="point-description"
            maxLength={250}
            value={form.description}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value })
            }
          />
          <label htmlFor="point-photo">
            Foto do ponto (opcional, até 2 MB)
          </label>
          <input
            id="point-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (
                file.size > 2 * 1024 * 1024 ||
                !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
              ) {
                setError('Use foto JPG, PNG ou WebP de até 2 MB.');
                event.target.value = '';
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setForm((current) => ({
                  ...current,
                  photo: String(reader.result),
                }));
                setError('');
              };
              reader.onerror = () => setError('Não foi possível ler a foto.');
              reader.readAsDataURL(file);
            }}
          />
          {form.photo && (
            <>
              <img
                className="point-photo"
                src={form.photo}
                alt="Prévia da foto do ponto"
              />
              <button
                className="text-button"
                type="button"
                onClick={() => setForm({ ...form, photo: '' })}
              >
                Remover foto
              </button>
            </>
          )}
          <p className="muted">
            Máximo de 4096 × 4096 pixels. Visível aos publicadores da
            congregação.
          </p>
          <label htmlFor="point-capacity">Grupos simultâneos</label>
          <input
            id="point-capacity"
            type="number"
            required
            min={1}
            max={2147483647}
            step={1}
            value={form.capacity}
            onChange={(event) =>
              setForm({ ...form, capacity: event.target.valueAsNumber })
            }
          />
          <fieldset>
            <legend>Tipos de equipamento permitidos</legend>
            {Object.entries(labels).map(([type, label]) => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={form.allowedTypes.includes(type)}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      allowedTypes: event.target.checked
                        ? [...form.allowedTypes, type]
                        : form.allowedTypes.filter((value) => value !== type),
                    })
                  }
                />{' '}
                {label}
              </label>
            ))}
          </fieldset>
          <p className="muted">
            A capacidade é total do ponto. Tipos permitidos podem ser
            configurados antes do cadastro das unidades.
          </p>
          <div className="panel-actions">
            <button className="button" disabled={busy}>
              {busy
                ? 'Salvando…'
                : editing
                  ? 'Salvar ponto'
                  : 'Cadastrar ponto'}
            </button>
            {editing && (
              <button
                type="button"
                className="button outline"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setView('list');
                  setForm(empty());
                }}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
