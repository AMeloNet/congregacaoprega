import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export async function alertRecipients(
  client: PoolClient,
  congregationId: string,
) {
  return (
    await client.query(
      "SELECT s.account_id FROM schedule_alert_recipient s JOIN membership m ON m.account_id=s.account_id AND m.congregation_id=s.congregation_id JOIN identity_account a ON a.id=s.account_id WHERE s.congregation_id=$1 AND m.status='ACTIVE' AND m.role='LOCAL_ADMIN' AND a.email_verified",
      [congregationId],
    )
  ).rows.map((row) => row.account_id as string);
}

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
  reservationId?: string,
) {
  if (reservationId) {
    const r = (
      await client.query(
        'SELECT r.local_date,r.start_hour,p.name FROM reservation r JOIN preaching_point p ON p.id=r.point_id WHERE r.id=$1 AND r.congregation_id=$2',
        [reservationId, congregationId],
      )
    ).rows[0];
    if (r)
      message += ` ${r.local_date.split('-').reverse().join('/')} · ${String(r.start_hour).padStart(2, '0')}:00 · ${r.name}.`;
  }
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
      reservationId,
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
