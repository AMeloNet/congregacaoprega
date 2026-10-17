import { useEffect, useState } from 'react';
import type { EquipmentContext } from './EquipmentPanel.js';
export function PointPhoto({
  context,
  pointId,
}: {
  context: EquipmentContext;
  pointId: string;
}) {
  const [photo, setPhoto] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setPhoto('');
    setError('');
    if (pointId)
      void fetch(
        `/api/congregations/${encodeURIComponent(context.congregationId)}/points/${encodeURIComponent(pointId)}/photo`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok)
            throw new Error('Não foi possível carregar a foto do ponto.');
          const result = await response.json();
          if (!controller.signal.aborted) setPhoto(result.photo);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError('Não foi possível carregar a foto do ponto.');
        });
    return () => controller.abort();
  }, [context.congregationId, pointId]);
  return (
    <>
      {photo && (
        <img
          className="point-photo"
          src={photo}
          alt="Foto do ponto de pregação"
        />
      )}
      {error && <p role="status">{error}</p>}
    </>
  );
}
