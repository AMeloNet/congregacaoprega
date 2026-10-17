import { useState, useEffect } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
import type { MenuScreen } from './GroupedMenu.js';
type Category = { label: string; endpoint: string; screen: MenuScreen };
const categories: Category[] = [
  { label: 'Equipamentos', endpoint: 'equipment', screen: 'equipamentos' },
  { label: 'Pontos', endpoint: 'points', screen: 'pontos' },
  { label: 'Horários', endpoint: 'points', screen: 'horarios' },
];
function ResourceList({
  context,
  category,
  go,
}: {
  context: EquipmentContext;
  category: Category;
  go: (screen: MenuScreen, create?: boolean) => void;
}) {
  const [items, setItems] = useState<
      { id: string; name: string; address?: string; active?: boolean }[] | null
    >(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch(
      `/api/congregations/${encodeURIComponent(context.congregationId)}/${category.endpoint}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (!controller.signal.aborted) setItems(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar os itens.');
      });
    return () => controller.abort();
  }, [context.congregationId, category.endpoint]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!items && !error && <p role="status">Carregando…</p>}
      {items && (
        <>
          <div className="resource-grid">
            {items.map((item) => (
              <article className="panel" key={item.id}>
                <h3>{item.name}</h3>
                {item.address && <p>{item.address}</p>}
                {item.active !== undefined && (
                  <p>{item.active ? 'Ativo' : 'Inativo'}</p>
                )}
              </article>
            ))}
          </div>
          {items.length === 0 && <p>Nenhum item cadastrado.</p>}
        </>
      )}
      <div className="panel-actions">
        <button className="button outline" onClick={() => go(category.screen)}>
          Ver {category.label.toLowerCase()}
        </button>
        <button className="button" onClick={() => go(category.screen, true)}>
          {category.screen === 'horarios'
            ? 'Configurar horários'
            : `Novo cadastro de ${category.label.toLowerCase()}`}
        </button>
      </div>
    </>
  );
}
export function ResourcesHub({
  context,
  go,
}: {
  context: EquipmentContext;
  go: (screen: MenuScreen, create?: boolean) => void;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  if (!context.canManage) return null;
  return (
    <section aria-label="Cadastros para reservas">
      {categories.map((category) => (
        <details
          className="panel"
          key={category.screen}
          onToggle={(event) => {
            const open = event.currentTarget.open;
            setExpanded((current) =>
              open
                ? [...new Set([...current, category.screen])]
                : current.filter((value) => value !== category.screen),
            );
          }}
        >
          <summary>{category.label}</summary>
          {expanded.includes(category.screen) && (
            <ResourceList context={context} category={category} go={go} />
          )}
        </details>
      ))}
    </section>
  );
}
