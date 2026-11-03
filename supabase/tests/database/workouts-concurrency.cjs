// Run only against a disposable local LifeOps database after the Workout migration.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const container = process.env.LIFEOPS_DB_CONTAINER;
const database = process.env.LIFEOPS_DB_NAME || 'postgres';
if (!container || !/^supabase-LifeOps-AI-database-/.test(container))
  throw new Error('Set LIFEOPS_DB_CONTAINER to the local LifeOps database container.');
if (!/^lifeops_workout_check$|^postgres$/.test(database))
  throw new Error('Use only the local LifeOps test or postgres database.');

function psql(sql, readyMarker) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
    '-U', 'supabase_admin', '-d', database, '-At']);
  let stdout = '';
  let stderr = '';
  let readyResolve;
  let readyReject;
  let readyDone = false;
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    if (!readyDone && readyMarker && stdout.includes(readyMarker)) {
      readyDone = true; readyResolve();
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const result = new Promise((resolve) => child.on('close', (code) => {
    if (!readyDone) {
      readyDone = true;
      if (readyMarker) readyReject(new Error(`Session never reached ${readyMarker}: ${stderr}`));
      else readyResolve();
    }
    resolve({ code, stdout, stderr });
  }));
  child.stdin.end(sql);
  return { ready, result };
}
async function query(sql) {
  const result = await psql(sql).result;
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function asOwner(owner, body) {
  return `begin; set local role authenticated;
select set_config('request.jwt.claim.sub','${owner}',true);
${body}
commit;`;
}

async function main() {
  const owner = randomUUID();
  const exerciseRequest = randomUUID();
  const createRequest = randomUUID();
  const concurrentCreateRequest = randomUUID();
  const firstEditRequest = randomUUID();
  const secondEditRequest = randomUUID();
  await query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
    email_confirmed_at,created_at,updated_at) values
    ('${owner}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
    '${owner}@example.test','test-only',now(),now(),now());`);
  try {
    await query(asOwner(owner, `insert into public.exercises (client_request_id,name,measurement_kind)
      values ('${exerciseRequest}','Concurrent push-up','reps');`));
    const exerciseId = await query(`select id from public.exercises where user_id='${owner}';`);
    const today = await query(`select (now() at time zone 'Asia/Manila')::date;`);
    const entries = `jsonb_build_array(jsonb_build_object('exercise_id','${exerciseId}',
      'sets',3,'reps',10))`;
    const command = (requestId, title, sessionId = 'null', expected = 'null') =>
      `select public.save_workout_session(${sessionId},'${requestId}',${expected},
        '${title}',null,'${today}',${entries});`;
    await query(asOwner(owner, command(createRequest, 'Original')));
    const sessionId = await query(`select id from public.workout_sessions
      where user_id='${owner}' and client_request_id='${createRequest}';`);
    const version = await query(`select updated_at from public.workout_sessions where id='${sessionId}';`);

    const first = psql(asOwner(owner,
      `${command(firstEditRequest, 'First edit', `'${sessionId}'`, `'${version}'`)}
      select 'EDIT_READY'; select pg_sleep(1.5);`), 'EDIT_READY');
    await first.ready;
    const second = psql(asOwner(owner,
      command(secondEditRequest, 'Second edit', `'${sessionId}'`, `'${version}'`)));
    const [one, two] = await Promise.all([first.result, second.result]);
    if (one.code !== 0 || two.code === 0 || !two.stderr.includes('Workout changed; reload and try again'))
      throw new Error('Concurrent stale edit was not rejected.');
    const title = await query(`select title from public.workout_sessions where id='${sessionId}';`);
    if (title !== 'First edit') throw new Error('Concurrent edit overwrote the first committed edit.');

    const create = command(concurrentCreateRequest, 'Concurrent create');
    const createOne = psql(asOwner(owner, `${create} select 'CREATE_READY'; select pg_sleep(1.5);`), 'CREATE_READY');
    await createOne.ready;
    const createTwo = psql(asOwner(owner, create));
    const [createdOne, createdTwo] = await Promise.all([createOne.result, createTwo.result]);
    const createdId = await query(`select id from public.workout_sessions
      where user_id='${owner}' and client_request_id='${concurrentCreateRequest}';`);
    if (createdOne.code !== 0 || createdTwo.code !== 0 ||
      !createdOne.stdout.includes(createdId) || !createdTwo.stdout.includes(createdId))
      throw new Error('Concurrent create retry did not return the same workout.');
    const count = await query(`select count(*) from public.workout_sessions
      where user_id='${owner}' and client_request_id='${concurrentCreateRequest}';`);
    if (count !== '1') throw new Error('Concurrent create produced duplicate workouts.');
    process.stdout.write('PASS: concurrent stale edit rejected; concurrent create applied once.\n');
  } finally {
    await query(`delete from auth.users where id='${owner}';`);
  }
}
main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
