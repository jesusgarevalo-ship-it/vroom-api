import { FastifyInstance } from 'fastify';
import { parseNaturalQuery, ParsedQuery } from './search.parser.js';

/**
 * Busca productos usando búsqueda full-text de PostgreSQL con pg_trgm
 * Soporta búsquedas naturales como "pastillas de freno corsa 2015"
 */
export async function searchProducts(
  app: FastifyInstance,
  query: string,
  city: string | null,
  limit: number,
  offset: number,
  category?: string | null
): Promise<{
  products: any[];
  total: number;
  limit: number;
  offset: number;
}> {
  // Parsear query natural para extraer vehículo, año, pieza
  const parsed = parseNaturalQuery(query);
  
  // Construir consulta SQL
  let sql = `
    SELECT 
      p.id,
      p.name,
      p.description,
      p.price_usd,
      p.image_url,
      p.stock,
      p.category,
      s.id as supplier_id,
      s.business_name,
      s.rating as supplier_rating,
      s.city as supplier_city,
      s.logo_url,
      pc.brand,
      pc.model,
      pc.year_from,
      pc.year_to
    FROM products p
    JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN product_compatibility pc ON p.id = pc.product_id
    WHERE p.is_active = true AND p.stock > 0
  `;
  
  const params: any[] = [];
  let paramIndex = 1;
  
  // Filtro por ciudad
  if (city) {
    sql += ` AND LOWER(s.city) = LOWER($${paramIndex})`;
    params.push(city);
    paramIndex++;
  }
  
  // Filtro por categoría
  if (category) {
    sql += ` AND p.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }
  
  // Búsqueda por texto con pg_trgm y tsvector
  if (parsed.text) {
    // Búsqueda en nombre y descripción
    sql += ` AND (
      p.name ILIKE $${paramIndex} 
      OR p.description ILIKE $${paramIndex}
      OR pc.brand ILIKE $${paramIndex}
      OR pc.model ILIKE $${paramIndex}
    )`;
    params.push(`%${parsed.text}%`);
    paramIndex++;
  }
  
  // Filtro por año si se detectó
  if (parsed.year) {
    sql += ` AND (pc.year_from <= $${paramIndex} AND pc.year_to >= $${paramIndex})`;
    params.push(parsed.year);
    paramIndex++;
  }
  
  // Filtro por marca
  if (parsed.brand) {
    sql += ` AND LOWER(pc.brand) = LOWER($${paramIndex})`;
    params.push(parsed.brand);
    paramIndex++;
  }
  
  // Filtro por modelo
  if (parsed.model) {
    sql += ` AND LOWER(pc.model) = LOWER($${paramIndex})`;
    params.push(parsed.model);
    paramIndex++;
  }
  
  // Ordenar por relevancia (precio bajo primero para MVP)
  sql += ` ORDER BY p.price_usd ASC`;
  
  // Contar total
  const countSql = sql.replace(
    /SELECT[\s\S]*?FROM/,
    'SELECT COUNT(DISTINCT p.id) as total FROM'
  ).replace(/pc\.brand,[\s\S]*?ORDER BY.*$/, '').replace(/LIMIT.*$/, '').replace(/OFFSET.*$/, '');
  
  // Agregar paginación
  sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);
  
  try {
    const [results, countResult] = await Promise.all([
      app.db.query(sql, params),
      countResult ? app.db.query(countSql, params.slice(0, -2)) : Promise.resolve({ rows: [{ total: 0 }] })
    ]);
    
    // Agrupar resultados por producto (para compatibilidad múltiple)
    const productMap = new Map();
    
    for (const row of results.rows) {
      if (!productMap.has(row.id)) {
        productMap.set(row.id, {
          id: row.id,
          name: row.name,
          description: row.description,
          price_usd: row.price_usd,
          image_url: row.image_url,
          stock: row.stock,
          category: row.category,
          supplier: {
            id: row.supplier_id,
            business_name: row.business_name,
            rating: row.supplier_rating,
            city: row.supplier_city,
            logo_url: row.logo_url,
          },
          compatibility: [],
        });
      }
      
      if (row.brand) {
        productMap.get(row.id).compatibility.push({
          brand: row.brand,
          model: row.model,
          year_from: row.year_from,
          year_to: row.year_to,
        });
      }
    }
    
    return {
      products: Array.from(productMap.values()),
      total: parseInt(countResult.rows[0]?.total || '0', 10),
      limit,
      offset,
    };
  } catch (err) {
    app.log.error('Error en searchProducts:', err);
    throw err;
  }
}