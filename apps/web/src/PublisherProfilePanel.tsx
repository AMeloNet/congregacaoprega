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
  email,
  initialFacePhoto = '',
}: {
  context: EquipmentContext;
  initialName: string;
  initialPhone?: string;
  target?: PublisherOption;
  email?: string;
  initialFacePhoto?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [facePhoto, setFacePhoto] = useState(initialFacePhoto);
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
          body: JSON.stringify({
            displayName: name,
            phone,
            ...(target ? {} : { facePhoto }),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message ?? 'Não foi possível salvar o perfil.');
      setName(result.displayName);
      setFacePhoto(result.facePhoto ?? '');
      setMessage('Perfil salvo nesta congregação.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={target ? 'panel' : 'panel account-profile-form'}
      onSubmit={(event) => void save(event)}
    >
      {target && (
        <p>
          {target.email} ·{' '}
          {target.status === 'ACTIVE' ? 'Ativo' : 'Vínculo revogado'}
        </p>
      )}
      <label htmlFor={`publisher-name-${target?.id ?? 'self'}`}>
        {target ? 'Nome do publicador' : 'Seu nome'}
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
        {target ? 'Telefone do publicador' : 'Telefone'}
      </label>
      <input
        id={`publisher-phone-${target?.id ?? 'self'}`}
        type="tel"
        maxLength={30}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        disabled={busy}
      />
      {!target && (
        <>
          <label htmlFor="publisher-email-self">Email</label>
          <input
            id="publisher-email-self"
            type="email"
            value={email ?? ''}
            readOnly
            aria-describedby="publisher-email-help"
          />
          <small id="publisher-email-help">
            O email é gerenciado pela sua identidade verificada.
          </small>
          <label htmlFor="publisher-face-photo-self">Foto Rosto</label>
          <input
            id="publisher-face-photo-self"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (
                file.size > 20 * 1024 * 1024 ||
                !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
              ) {
                setError('Use foto JPG, PNG ou WebP de até 20 MB.');
                event.target.value = '';
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                setFacePhoto(String(reader.result));
                setError('');
              };
              reader.onerror = () => setError('Não foi possível ler a foto.');
              reader.readAsDataURL(file);
            }}
          />
          {facePhoto && (
            <>
              <img
                className="profile-face-photo"
                src={facePhoto}
                alt="Prévia da foto de rosto"
              />
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => setFacePhoto('')}
              >
                Remover foto
              </button>
            </>
          )}
          <small>Opcional: JPG, PNG ou WebP de até 20 MB.</small>
        </>
      )}
      <button className="button outline" disabled={busy}>
        Salvar perfil
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
      email: string;
      facePhoto?: string;
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
    <section aria-label={manage ? 'Nomes dos publicadores' : 'Minha conta'}>
      <h2>{manage ? 'Nomes dos publicadores' : 'Minha conta'}</h2>
      <p>
        {manage
          ? 'Use o nome que deve aparecer no relatório desta congregação. E-mails não serão impressos.'
          : 'Atualize seus dados desta congregação. O e-mail é gerenciado pela sua identidade verificada.'}
      </p>
      {error && <p role="alert">{error}</p>}
      {self && (
        <NameEditor
          context={context}
          initialName={self.displayName}
          initialPhone={self.phone}
          email={self.email}
          initialFacePhoto={self.facePhoto}
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
