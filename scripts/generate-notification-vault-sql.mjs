import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputPath = process.argv[2];
const projectUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!outputPath) throw new Error('An output SQL path is required.');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(projectUrl ?? '')) {
  throw new Error('SUPABASE_URL is missing or invalid.');
}
if (!publishableKey?.startsWith('sb_publishable_')) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY is missing or invalid.');
}

const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`;
const secrets = [
  ['choosr_project_url', projectUrl],
  ['choosr_publishable_key', publishableKey],
];

const statements = secrets
  .map(
    ([name, value]) => `
do $configure_vault$
declare
  v_secret_id uuid;
begin
  select id into v_secret_id from vault.secrets where name = ${sqlLiteral(
    name,
  )};
  if v_secret_id is null then
    perform vault.create_secret(${sqlLiteral(value)}, ${sqlLiteral(name)});
  else
    perform vault.update_secret(v_secret_id, ${sqlLiteral(value)}, ${sqlLiteral(
      name,
    )});
  end if;
end;
$configure_vault$;`,
  )
  .join('\n');

await writeFile(resolve(outputPath), `${statements}\n`, { mode: 0o600 });
console.log('Generated temporary notification dispatcher Vault configuration.');
