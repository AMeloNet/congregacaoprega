import { isDeepStrictEqual } from 'node:util';
import type { Pool, PoolClient } from 'pg';

type Database = Pool | PoolClient;
interface CatalogEntry {
  kind: string;
  name: string;
  definition: unknown;
  model_visible: boolean;
}

async function readCatalog(database: Database): Promise<CatalogEntry[]> {
  const result = await database.query<CatalogEntry>(`
    WITH relations AS (
      SELECT c.oid, c.relname, c.relkind
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname <> '_prisma_migrations'
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
    )
    SELECT 'relation' AS kind, r.relname::text AS name,
      jsonb_build_object('kind', r.relkind, 'view',
        CASE WHEN r.relkind IN ('v', 'm') THEN pg_get_viewdef(r.oid, false) END) AS definition,
      true AS model_visible
    FROM relations r
    UNION ALL
    SELECT 'column', r.relname || '.' || a.attname,
      jsonb_build_object('type', format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid),
        'identity', a.attidentity, 'generated', a.attgenerated), true
    FROM relations r JOIN pg_attribute a ON a.attrelid = r.oid
    LEFT JOIN pg_attrdef d ON d.adrelid = r.oid AND d.adnum = a.attnum
    WHERE a.attnum > 0 AND NOT a.attisdropped
    UNION ALL
    SELECT 'constraint', r.relname || '.' || c.conname,
      jsonb_build_object('definition', pg_get_constraintdef(c.oid, false),
        'validated', c.convalidated), c.contype <> 'c'
    FROM relations r JOIN pg_constraint c ON c.conrelid = r.oid
    UNION ALL
    SELECT 'index', r.relname || '.' || ic.relname,
      jsonb_build_object('definition', pg_get_indexdef(i.indexrelid),
        'valid', i.indisvalid, 'ready', i.indisready), i.indpred IS NULL
    FROM relations r JOIN pg_index i ON i.indrelid = r.oid
    JOIN pg_class ic ON ic.oid = i.indexrelid
    UNION ALL
    SELECT 'enum', t.typname, jsonb_agg(e.enumlabel ORDER BY e.enumsortorder), true
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    UNION ALL
    SELECT 'trigger', r.relname || '.' || t.tgname,
      jsonb_build_object('definition', pg_get_triggerdef(t.oid, false),
        'enabled', t.tgenabled), true
    FROM relations r JOIN pg_trigger t ON t.tgrelid = r.oid
    WHERE NOT t.tgisinternal
    ORDER BY kind, name
  `);
  return result.rows;
}

function assertCatalog(
  actual: CatalogEntry[],
  expected: CatalogEntry[],
  label: string,
) {
  if (isDeepStrictEqual(actual, expected)) return;
  const expectedEntries = new Map(
    expected.map((entry) => [entry.kind + ':' + entry.name, entry]),
  );
  const actualEntries = new Map(
    actual.map((entry) => [entry.kind + ':' + entry.name, entry]),
  );
  const keys = new Set([...actualEntries.keys(), ...expectedEntries.keys()]);
  const changed = [...keys].filter(
    (key) =>
      !isDeepStrictEqual(actualEntries.get(key), expectedEntries.get(key)),
  );
  throw new Error(label + ': ' + changed.sort().join(', '));
}

export async function verifySchema(
  actual: Database,
  history: Database,
  model: Database,
): Promise<void> {
  const [actualCatalog, historyCatalog, modelCatalog] = await Promise.all([
    readCatalog(actual),
    readCatalog(history),
    readCatalog(model),
  ]);
  assertCatalog(actualCatalog, historyCatalog, 'Schema drift');
  // These SQL-only objects remain mandatory in the full history comparison above.
  assertCatalog(
    historyCatalog.filter((entry) => entry.model_visible),
    modelCatalog.filter((entry) => entry.model_visible),
    'Prisma model drift',
  );
}
