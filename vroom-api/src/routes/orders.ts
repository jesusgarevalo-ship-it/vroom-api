import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'crypto';

interface CreateOrderBody {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  deliveryAddress: string;
  city: string;
  customerName: string;
  customerPhone: string;
}

interface OrderParams {
  id: string;
}

export const ordersRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Crear orden
  app.post<{ Body: CreateOrderBody }>('/', {
    schema: {
      body: {
        type: 'object',
        required: ['items', 'deliveryAddress', 'city', 'customerName', 'customerPhone'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['productId', 'quantity'],
              properties: {
                productId: { type: 'string', format: 'uuid' },
                quantity: { type: 'integer', minimum: 1 },
              },
            },
          },
          deliveryAddress: { type: 'string', minLength: 5 },
          city: { type: 'string' },
          customerName: { type: 'string', minLength: 2 },
          customerPhone: { type: 'string', pattern: '^[0-9]{11}$' },
        },
      },
    },
  }, async (request, reply) => {
    const { items, deliveryAddress, city, customerName, customerPhone } = request.body;
    
    const client = await app.db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Verificar productos y calcular total
      let totalUsd = 0;
      const orderItems: Array<{
        productId: string;
        quantity: number;
        priceUsd: number;
        supplierId: string;
      }> = [];
      
      for (const item of items) {
        const productResult = await client.query(
          'SELECT id, price_usd, supplier_id, stock FROM products WHERE id = $1',
          [item.productId]
        );
        
        if (productResult.rows.length === 0) {
          await client.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Invalid Product',
            message: `Producto ${item.productId} no encontrado`,
            code: 'PRODUCT_NOT_FOUND',
          });
        }
        
        const product = productResult.rows[0];
        
        if (product.stock < item.quantity) {
          await client.query('ROLLBACK');
          return reply.status(400).send({
            error: 'Insufficient Stock',
            message: `Stock insuficiente para ${product.name}`,
            code: 'INSUFFICIENT_STOCK',
          });
        }
        
        totalUsd += parseFloat(product.price_usd) * item.quantity;
        orderItems.push({
          productId: item.productId,
          quantity: item.quantity,
          priceUsd: parseFloat(product.price_usd),
          supplierId: product.supplier_id,
        });
      }
      
      // Crear orden
      const orderId = randomBytes(16).toString('hex');
      const now = new Date().toISOString();
      
      await client.query(`
        INSERT INTO orders (
          id, status, total_usd, delivery_address, city,
          customer_name, customer_phone, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        orderId,
        'pending_payment',
        totalUsd,
        deliveryAddress,
        city,
        customerName,
        customerPhone,
        now,
        now,
      ]);
      
      // Crear items de orden
      for (const item of orderItems) {
        await client.query(`
          INSERT INTO order_items (id, order_id, product_id, quantity, price_usd)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          randomBytes(8).toString('hex'),
          orderId,
          item.productId,
          item.quantity,
          item.priceUsd,
        ]);
      }
      
      await client.query('COMMIT');
      
      app.log.info(`📦 Orden ${orderId} creada - Total: $${totalUsd.toFixed(2)} USD`);
      
      return reply.status(201).send({
        success: true,
        orderId,
        status: 'pending_payment',
        totalUsd,
        paymentInstructions: {
          message: 'Paga con Pago Móvil',
          nextStep: 'POST /payments/initiate',
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      app.log.error('Error creando orden:', err);
      return reply.status(500).send({
        error: 'Order Creation Failed',
        message: 'Error al crear la orden',
        code: 'ORDER_ERROR',
      });
    } finally {
      client.release();
    }
  });

  // Obtener orden por ID
  app.get<{ Params: OrderParams }>('/:id', {
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    
    const orderResult = await app.db.query(`
      SELECT 
        o.*,
        d.full_name as driver_name,
        d.phone as driver_phone,
        v.plate as vehicle_plate,
        v.model as vehicle_model
      FROM orders o
      LEFT JOIN deliveries d ON o.id = d.order_id
      LEFT JOIN drivers d2 ON d.driver_id = d2.id
      LEFT JOIN vehicles v ON d2.vehicle_id = v.id
      WHERE o.id = $1
    `, [id]);
    
    if (orderResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Orden no encontrada',
        code: 'ORDER_NOT_FOUND',
      });
    }
    
    const order = orderResult.rows[0];
    
    // Obtener items
    const itemsResult = await app.db.query(`
      SELECT 
        oi.*,
        p.name as product_name,
        p.image_url
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
    `, [id]);
    
    // Obtener tracking si existe
    let tracking = null;
    const trackingResult = await app.db.query(`
      SELECT status, updated_at 
      FROM delivery_tracking 
      WHERE order_id = $1 
      ORDER BY updated_at DESC 
      LIMIT 1
    `, [id]);
    
    if (trackingResult.rows.length > 0) {
      tracking = trackingResult.rows[0];
    }
    
    return {
      success: true,
      order: {
        ...order,
        items: itemsResult.rows,
        tracking,
      },
    };
  });

  // Listar órdenes del cliente
  app.get('/', async (request, reply) => {
    const { phone, limit = 20, offset = 0 } = request.query as {
      phone?: string;
      limit?: number;
      offset?: number;
    };
    
    if (!phone) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Se requiere phone',
        code: 'MISSING_PHONE',
      });
    }
    
    const result = await app.db.query(`
      SELECT id, status, total_usd, created_at, city
      FROM orders
      WHERE customer_phone = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, [phone, limit, offset]);
    
    return {
      success: true,
      orders: result.rows,
      pagination: {
        limit,
        offset,
        count: result.rows.length,
      },
    };
  });
};