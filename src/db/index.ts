import { Pool } from 'pg';

// Pool se inicializa en el plugin, aquí solo re-exportamos
export { Pool };

// Tipos adicionales para la base de datos
export interface DbResult<T = any> {
  rows: T[];
  rowCount: number;
}

// Query helper simple
export async function query<T = any>(
  pool: Pool,
  text: string,
  params?: any[]
): Promise<DbResult<T>> {
  const result = await pool.query<T>(text, params);
  return {
    rows: result.rows,
    rowCount: result.rowCount || 0,
  };
}