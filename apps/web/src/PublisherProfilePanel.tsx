import { useEffect, useState, type FormEvent } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
export type PublisherOption = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  verified: boolean;
  phone?: string;
};
function NameEditor({
  context,
  initialName,
  target,
  initialPhone = '',
}: {
  context: EquipmentContext;
  initialName: string;
  initialPhone?: string;
  target?: PublisherOption;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch(
        `/api/congregations/${encodeURIComponent(context.congregationId)}/${target ? `publishers/${target.id}/name` : 'publisher-profile'}`,
        {
          method: 'PUT',
          headers: {
            'x-csrf-token': context.csrfToken,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ displayName: name, phone }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível salvar o nome.');
      setName(result.displayName);
      setMessage('Nome salvo nesta congregação.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={(event) => void save(event)}>
      {target && (
        <p>
          {target.email} ·{' '}
          {target.status === 'ACTIVE' ? 'Ativo' : 'Vínculo revogado'}
        </p>
      )}
      <label htmlFor={`publisher-name-${target?.id ?? 'self'}`}>
        {target ? 'Nome do publicador' : 'Seu nome na programação'}
      </label>
      <input
        id={`publisher-name-${target?.id ?? 'self'}`}
        required
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
        disabled={busy}
      />
      <label htmlFor={`publisher-phone-${target?.id ?? 'self'}`}>
        Telefone do publicador
      </label>
      <input
        id={`publisher-phone-${target?.id ?? 'self'}`}
        type="tel"
        maxLength={30}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
      />
      <button className="button outline" disabled={busy}>
        Salvar nome
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function PublisherProfilePanel({
  context,
  manage = false,
}: {
  context: EquipmentContext;
  manage?: boolean;
}) {
  const [self, setSelf] = useState<{
      displayName: string;
      phone?: string;
    } | null>(null),
    [people, setPeople] = useState<PublisherOption[]>([]),
    [error, setError] = useState('');
  const base = `/api/congregations/${encodeURIComponent(context.congregationId)}`;
  useEffect(() => {
    const controller = new AbortController();
    setSelf(null);
    setPeople([]);
    setError('');
    void fetch(
      `${base}/${manage && context.canManage ? 'reservation-publishers' : 'publisher-profile'}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Não foi possível carregar os nomes.');
        const result = await response.json();
        if (!controller.signal.aborted) {
          if (manage && context.canManage) setPeople(result);
          else setSelf(result);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError((failure as Error).message);
      });
    return () => controller.abort();
  }, [base, context.canManage, manage]);
  return (
    <section
      aria-label={manage ? 'Nomes dos publicadores' : 'Seu nome na programação'}
    >
      <h2>{manage ? 'Nomes dos publicadores' : 'Seu nome na programação'}</h2>
      <p>
        Use o nome que deve aparecer no relatório desta congregação. E-mails não
        serão impressos.
      </p>
      {error && <p role="alert">{error}</p>}
      {self && (
        <NameEditor
          context={context}
          initialName={self.displayName}
          initialPhone={self.phone}
        />
      )}{' '}
      <div className="resource-grid">
        {people.map((p) => (
          <article className="panel" key={p.id}>
            <h3>{p.displayName || 'Nome não informado'}</h3>
            <p>{p.email}</p>
            <p>{p.status === 'ACTIVE' ? 'Ativo' : 'Revogado'}</p>
            <details>
              <summary>Ver detalhes de {p.displayName || p.email}</summary>
              <NameEditor
                key={p.id}
                context={context}
                target={p}
                initialName={p.displayName ?? ''}
                initialPhone={p.phone ?? ''}
              />
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
