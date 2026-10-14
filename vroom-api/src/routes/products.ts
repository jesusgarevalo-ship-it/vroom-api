import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { searchProducts } from '../services/search.service.js';

interface SearchQuery {
  q?: string;
  city?: string;
  limit?: number;
  offset?: number;
  category?: string;
}

interface ProductParams {
  id: string;
}

// Categorías hardcodeadas para MVP
const CATEGORIES = [
  { id: 'frenos', name: 'Frenos', icon: 'brake' },
  { id: 'motor', name: 'Motor', icon: 'engine' },
  { id: 'suspension', name: 'Suspensión', icon: 'suspension' },
  { id: 'electricidad', name: 'Electricidad', icon: 'battery' },
  { id: 'embrague', name: 'Embrague', icon: 'clutch' },
  { id: 'transmision', name: 'Transmisión', icon: 'gear' },
  { id: 'direccion', name: 'Dirección', icon: 'steering' },
  { id: 'escape', name: 'Escape', icon: 'exhaust' },
  { id: 'carroceria', name: 'Carrocería', icon: 'body' },
  { id: 'accesorios', name: 'Accesorios', icon: 'tools' },
];

export const productsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Buscar productos
  app.get<{ Querystring: SearchQuery }>('/search', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          city: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          category: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { q, city, limit = 20, offset = 0, category } = request.query;
    
    if (!q && !category) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Se requiere query (q) o categoría (category)',
        code: 'MISSING_QUERY',
      });
    }
    
    try {
      const results = await searchProducts(
        app,
        q || '',
        city || null,
        limit,
        offset,
        category || null
      );
      
      return {
        success: true,
        ...results,
      };
    } catch (err) {
      app.log.error('Error en búsqueda:', err);
      return reply.status(500).send({
        error: 'Search Error',
        message: 'Error al buscar productos',
        code: 'SEARCH_ERROR',
      });
    }
  });

  // Listar categorías
  app.get('/categories', async () => {
    return {
      success: true,
      categories: CATEGORIES,
    };
  });

  // Obtener producto por ID
  app.get<{ Params: ProductParams }>('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    
    const result = await app.db.query(`
      SELECT 
        p.*,
        s.id as supplier_id,
        s.business_name,
        s.rating as supplier_rating,
        s.city as supplier_city,
        s.logo_url
      FROM products p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Producto no encontrado',
        code: 'PRODUCT_NOT_FOUND',
      });
    }
    
    const product = result.rows[0];
    
    // Obtener compatibilidad
    const compatibility = await app.db.query(`
      SELECT brand, model, year_from, year_to 
      FROM product_compatibility 
      WHERE product_id = $1
    `, [id]);
    
    return {
      success: true,
      product: {
        ...product,
        compatibility: compatibility.rows,
      },
    };
  });
};