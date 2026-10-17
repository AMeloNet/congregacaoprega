import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export async function recordReservationEvent(
  client: PoolClient,
  reservationId: string,
  actor: string,
  action: string,
  previous: unknown,
  configuration: unknown,
) {
  await client.query(
    'INSERT INTO reservation_history (id,reservation_id,actor_account_id,action,previous,configuration) VALUES ($1,$2,$3,$4,$5,$6)',
    [
      randomUUID(),
      reservationId,
      actor,
      action,
      JSON.stringify(previous),
      JSON.stringify(configuration),
    ],
  );
}

export async function notice(
  client: PoolClient,
  congregationId: string,
  recipients: string[],
  eventKey: string,
  message: string,
  now: Date,
) {
  for (const account of new Set(recipients))
    await client.query(
      'INSERT INTO schedule_notice (id,congregation_id,recipient_account_id,event_key,message,created_at,next_attempt_at) VALUES ($1,$2,$3,$4,$5,$6,$6) ON CONFLICT (event_key,recipient_account_id) DO NOTHING',
      [randomUUID(), congregationId, account, eventKey, message, now],
    );
}

export async function expireInvitations(
  client: PoolClient,
  reservationId: string,
  now: Date,
) {
  const expired = (
    await client.query(
      "UPDATE reservation_invitation SET state='expired',completed_at=$2 WHERE reservation_id=$1 AND state='pending' AND expires_at<=$2 RETURNING *",
      [reservationId, now],
    )
  ).rows;
  if (!expired.length) return;
  const r = (
    await client.query(
      'SELECT congregation_id,responsible_account_id FROM reservation WHERE id=$1',
      [reservationId],
    )
  ).rows[0];
  for (const invitation of expired)
    await notice(
      client,
      r.congregation_id,
      [r.responsible_account_id, invitation.recipient_account_id],
      `invitation-expired:${invitation.id}`,
      'Um convite expirou. A posição foi liberada.',
      now,
    );
}

export async function groupPositions(
  client: PoolClient,
  reservationId: string,
  now: Date,
) {
  return (
    await client.query(
      `SELECT account_id,position,'confirmed' AS kind FROM reservation_participation WHERE reservation_id=$1
    UNION ALL SELECT recipient_account_id,position,'pending' FROM reservation_invitation WHERE reservation_id=$1 AND state='pending' AND expires_at>$2`,
      [reservationId, now],
    )
  ).rows;
}
