// Run against a disposable local LifeOps database with the new Loan migration.
// LIFEOPS_DB_CONTAINER is the LifeOps database container; never use a hosted URL.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const container = process.env.LIFEOPS_DB_CONTAINER;
const database = process.env.LIFEOPS_DB_NAME || 'postgres';
if (!container || !/^supabase-LifeOps-AI-database-/.test(container)) {
  throw new Error('Set LIFEOPS_DB_CONTAINER to the local LifeOps database container.');
}
if (!/^lifeops_loan_check$|^postgres$/.test(database)) {
  throw new Error('Use only the local LifeOps test or postgres database.');
}

function psql(sql, readyMarker) {
  const child = spawn('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '-d',
    database,
    '-At',
  ]);
  let stdout = '';
  let stderr = '';
  let readyResolve;
  let readyReject;
  let readyDone = false;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    if (!readyDone && readyMarker && stdout.includes(readyMarker)) {
      readyDone = true;
      readyResolve();
    }
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const result = new Promise((resolve) => {
    child.on('close', (code) => {
      if (!readyDone) {
        readyDone = true;
        if (readyMarker) readyReject(new Error(`Session never reached ${readyMarker}: ${stderr}`));
        else readyResolve();
      }
      resolve({ code, stdout, stderr });
    });
  });
  child.stdin.end(sql);
  return { ready, result };
}
async function query(sql) {
  const value = await psql(sql).result;
  if (value.code !== 0) throw new Error(value.stderr);
  return value.stdout;
}
function asOwner(owner, body) {
  return `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${owner}', true);
${body}
commit;`;
}
async function main() {
  const owner = randomUUID();
  const loan = randomUUID();
  await query(`insert into auth.users (id, instance_id, aud, role, email,
    encrypted_password, email_confirmed_at, created_at, updated_at)
    values ('${owner}','00000000-0000-0000-0000-000000000000',
      'authenticated','authenticated','${owner}@example.test','test-only',now(),now(),now());
    insert into public.loans (id,user_id,title,monthly_payment_centavos,first_due_date,total_months)
    values ('${loan}','${owner}','Concurrent loan',10000,'2026-11-15',2);`);
  try {
    const paid = psql(
      asOwner(
        owner,
        `select public.set_loan_installment_paid((select id from public.loan_installments
      where loan_id = '${loan}' and installment_number = 1), true);
      select 'PAID_READY'; select pg_sleep(1.5);`,
      ),
      'PAID_READY',
    );
    await paid.ready;
    const deletion = psql(asOwner(owner, `delete from public.loans where id = '${loan}';`));
    const [paidResult, deleteResult] = await Promise.all([paid.result, deletion.result]);
    if (
      paidResult.code !== 0 ||
      deleteResult.code === 0 ||
      !deleteResult.stderr.includes('Archive loans with paid installment history')
    ) {
      throw new Error('Concurrent delete did not preserve paid history.');
    }
    const firstCount = (
      await query(`select count(*) from public.loan_installments
      where loan_id = '${loan}' and paid_at is not null;`)
    ).trim();
    if (firstCount !== '1') throw new Error('Expected exactly one paid installment.');

    const first = psql(
      asOwner(
        owner,
        `select public.set_loan_installment_paid((select id from public.loan_installments
      where loan_id = '${loan}' and installment_number = 2), true);
      select 'PAID_READY'; select pg_sleep(1.5);`,
      ),
      'PAID_READY',
    );
    await first.ready;
    const second = psql(
      asOwner(
        owner,
        `select public.set_loan_installment_paid((select id from public.loan_installments
      where loan_id = '${loan}' and installment_number = 2), true);`,
      ),
    );
    const [one, two] = await Promise.all([first.result, second.result]);
    const paidAt = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?\+\d{2}/;
    if (one.code !== 0 || two.code !== 0 || one.stdout.match(paidAt)?.[0] !== two.stdout.match(paidAt)?.[0]) {
      throw new Error('Concurrent retry did not resolve as a single paid transition.');
    }
    const finalCount = (
      await query(`select count(*) from public.loan_installments
      where loan_id = '${loan}' and paid_at is not null;`)
    ).trim();
    if (finalCount !== '2') throw new Error('Concurrent retry changed installment count.');
    process.stdout.write('PASS: concurrent delete blocked; paid retry applied once.\n');
  } finally {
    await query(`delete from public.loan_installments where loan_id = '${loan}';
      delete from public.loans where id = '${loan}';
      delete from auth.users where id = '${owner}';`);
  }
}
main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
