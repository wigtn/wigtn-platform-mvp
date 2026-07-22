const POSTGRES_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function identifier(value: string, label: string): string {
  if (!POSTGRES_IDENTIFIER.test(value)) {
    throw new Error(`${label} must be a lowercase Postgres identifier`);
  }
  return `"${value}"`;
}

/**
 * Shared Supabase projects namespace each product's private schema.
 * Local development keeps the historical app_private default.
 */
export function privateFunction(name: string): string {
  const schema = process.env.OUTBOX_PRIVATE_SCHEMA ?? "app_private";
  return `${identifier(schema, "OUTBOX_PRIVATE_SCHEMA")}.${identifier(name, "function name")}`;
}
