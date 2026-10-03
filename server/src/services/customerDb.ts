import { Client } from 'pg';
import mysql from 'mysql2/promise';

// Connections to a customer's own database (schema introspection and the
// database dashboard). Every session is switched to read-only before any query
// runs, so the database itself rejects writes even when the configured user is
// allowed to make them. This is the guarantee behind "read-only introspection".

export interface CustomerDbConnection {
  host: string;
  port: string | number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export type MysqlConnection = Awaited<ReturnType<typeof mysql.createConnection>>;

export async function connectPostgres(conn: CustomerDbConnection): Promise<Client> {
  const client = new Client({
    host: conn.host, port: parseInt(String(conn.port), 10) || 5432, database: conn.database, user: conn.user,
    password: conn.password, ssl: conn.ssl ? { rejectUnauthorized: false } : undefined, connectionTimeoutMillis: 8000,
  });
  await client.connect();
  try {
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }
  return client;
}

export async function connectMysql(conn: CustomerDbConnection): Promise<MysqlConnection> {
  const connection = await mysql.createConnection({
    host: conn.host, port: parseInt(String(conn.port), 10) || 3306, database: conn.database, user: conn.user,
    password: conn.password, ssl: conn.ssl ? { rejectUnauthorized: false } : undefined, connectTimeout: 8000,
  });
  try {
    await connection.query('SET SESSION TRANSACTION READ ONLY');
  } catch (error) {
    await connection.end().catch(() => undefined);
    throw error;
  }
  return connection;
}
