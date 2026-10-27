import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import postgres from 'npm:postgres@3.4.7';
import { restrictedDatabaseUrl } from './database-url.ts';

type Command = {
  action: 'create' | 'edit' | 'edit_due' | 'set_paid' | 'archive' | 'delete' | 'reconcile';
  request_id: string;
  payload: Record<string, string | boolean | null>;
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = new Set([
  'create',
  'edit',
  'edit_due',
  'set_paid',
  'archive',
  'delete',
  'reconcile',
]);
const MAX_REQUEST_BYTES = 16_384;
const fields: Record<Command['action'], readonly string[]> = {
  create: ['title', 'amount_minor', 'due_on', 'category', 'recurrence', 'notes'],
  edit: ['id', 'title', 'amount_minor', 'due_on', 'category', 'recurrence', 'notes'],
  edit_due: ['id', 'due_on'],
  set_paid: ['id', 'paid'],
  archive: ['id'],
  delete: ['id'],
  reconcile: [],
};

function validPayload(action: Command['action'], payload: Command['payload']): boolean {
  const names = Object.keys(payload);
  if (names.some((name) => !fields[action].includes(name))) return false;
  if (action === 'reconcile') return names.length === 0;
  if (action === 'create' || action === 'edit') {
    if (
      typeof payload.title !== 'string' ||
      typeof payload.amount_minor !== 'string' ||
      typeof payload.due_on !== 'string'
    )
      return false;
    if (payload.category !== undefined && typeof payload.category !== 'string') return false;
    if (payload.recurrence !== undefined && typeof payload.recurrence !== 'string') return false;
    if (payload.notes !== undefined && typeof payload.notes !== 'string') return false;
  }
  if (action !== 'create' && (typeof payload.id !== 'string' || !uuid.test(payload.id)))
    return false;
  if (action === 'edit_due' && typeof payload.due_on !== 'string') return false;
  if (action === 'set_paid' && typeof payload.paid !== 'boolean') return false;
  return true;
}

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: cors });
}

async function readCommandBody(request: Request): Promise<Command> {
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_REQUEST_BYTES) throw new Error('too-large');
  if (!request.body) throw new Error('invalid');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let value = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new Error('too-large');
    }
    value += decoder.decode(part.value, { stream: true });
  }
  value += decoder.decode();
  return JSON.parse(value) as Command;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return response({ error: 'Sign in to continue.' }, 401);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  const databaseUrl = restrictedDatabaseUrl(
    Deno.env.get('BILLS_DATABASE_URL'),
    Deno.env.get('SUPABASE_DB_URL'),
    Deno.env.get('BILLS_DB_PASSWORD'),
    url,
  );
  if (!url || !key || !databaseUrl)
    return response({ error: 'Bills service is unavailable.' }, 503);

  const auth = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return response({ error: 'Sign in to continue.' }, 401);

  let body: Command;
  try {
    body = await readCommandBody(request);
  } catch (caught) {
    return caught instanceof Error && caught.message === 'too-large'
      ? response({ error: 'Bill request is too large.' }, 413)
      : response({ error: 'Invalid request.' }, 400);
  }
  if (
    !body ||
    !actions.has(body.action) ||
    !uuid.test(body.request_id) ||
    !body.payload ||
    Array.isArray(body.payload) ||
    typeof body.payload !== 'object' ||
    !validPayload(body.action, body.payload)
  ) {
    return response({ error: 'Invalid request.' }, 400);
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    ssl: Deno.env.get('BILLS_DATABASE_URL') ? 'require' : false,
  });
  try {
    const rows = await sql`
      select app_private.bill_command(${data.user.id}::uuid, ${body.action},
        ${body.request_id}::uuid, ${sql.json(body.payload)}::jsonb) as result
    `;
    return response({ result: rows[0]?.result }, 200);
  } catch (caught) {
    const pg = caught as { code?: string; message?: string };
    // Deliberate validation errors are safe to show. Other errors can contain SQL or details.
    if (pg.code === 'P0001') return response({ error: pg.message ?? 'Invalid bill request.' }, 400);
    return response({ error: 'Bill could not be saved. Retry with the same request.' }, 503);
  } finally {
    await sql.end();
  }
});
