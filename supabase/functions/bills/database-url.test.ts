import { restrictedDatabaseUrl } from './database-url.ts';

const projectUrl = 'https://abc123.supabase.co';
const pooler = 'aws-0-ap-southeast-1.pooler.supabase.com';
const postgresScheme = 'postgresql';

Deno.test('accepts only the Development restricted role on its shared pooler', () => {
  const valid = `${postgresScheme}://lifeops_bill_commands.abc123:private@${pooler}:6543/postgres`;
  if (restrictedDatabaseUrl(valid, undefined, undefined, projectUrl) !== valid) {
    throw new Error('Restricted pooler URL was rejected');
  }
  for (const invalid of [
    `${postgresScheme}://postgres.abc123:private@${pooler}:6543/postgres`,
    `${postgresScheme}://lifeops_bill_commands.other:private@${pooler}:6543/postgres`,
    `${postgresScheme}://lifeops_bill_commands.abc123:private@${pooler}:5432/postgres`,
    `${postgresScheme}://lifeops_bill_commands.abc123:private@db.abc123.supabase.co:5432/postgres`,
  ]) {
    if (restrictedDatabaseUrl(invalid, undefined, undefined, projectUrl) !== null) {
      throw new Error('Unsafe pooler URL was accepted');
    }
  }
});

Deno.test('local runtime substitutes only the restricted role and requires its password', () => {
  const inherited = `${postgresScheme}://postgres:unused@db:5432/postgres`;
  const result = restrictedDatabaseUrl(undefined, inherited, 'private', 'http://localhost:54321');
  if (result !== `${postgresScheme}://lifeops_bill_commands:private@db:5432/postgres`) {
    throw new Error('Local restricted URL was not built');
  }
  if (restrictedDatabaseUrl(undefined, inherited, undefined, projectUrl) !== null) {
    throw new Error('Local connection without a restricted password was accepted');
  }
});
