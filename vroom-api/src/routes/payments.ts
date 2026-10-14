import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { calculateBsAmount, generateReference } from '../services/payment.service.js';

interface InitiatePaymentBody {
  orderId: string;
}

interface ConfirmPaymentBody {
  reference: string;
  phone: string;
  amount: number;
}

interface VerifyCallbackQuery {
  reference: string;
  amount: string;
}

export const paymentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Iniciar pago - generar referencia Pago Móvil
  app.post<{ Body: InitiatePaymentBody }>('/initiate', {
    schema: {
      body: {
        type: 'object',
        required: ['orderId'],
        properties: {
          orderId: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { orderId } = request.body;
    
    // Obtener orden
    const orderResult = await app.db.query(
      'SELECT id, total_usd, status FROM orders WHERE id = $1',
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Orden no encontrada',
        code: 'ORDER_NOT_FOUND',
      });
    }
    
    const order = orderResult.rows[0];
    
    if (order.status !== 'pending_payment') {
      return reply.status(400).send({
        error: 'Invalid State',
        message: 'La orden no está pendiente de pago',
        code: 'INVALID_ORDER_STATE',
      });
    }
    
    // Generar referencia única
    const reference = generateReference();
    
    // Calcular monto en BS (usando tasa BCV + 2% recargo)
    const bsAmount = await calculateBsAmount(order.total_usd);
    
    // Guardar pago pendiente
    const paymentId = require('crypto').randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    
    await app.db.query(`
      INSERT INTO payments (
        id, order_id, reference, amount_usd, amount_bs, 
        rate_used, status, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      paymentId,
      orderId,
      reference,
      order.total_usd,
      bsAmount,
      bsAmount / order.total_usd,
      'pending',
      now,
    ]);
    
    app.log.info(`💰 Pago iniciado - Ref: ${reference} - Bs ${bsAmount.toFixed(2)}`);
    
    return {
      success: true,
      paymentId,
      reference,
      amountBs: bsAmount,
      instructions: {
        bank: 'Banco de Venezuela (BDV)',
        phone: '04141234567',
        reference,
        amount: `Bs ${bsAmount.toFixed(2)}`,
        concept: 'VROOM',
        note: 'Incluir referencia exacta en el Pago Móvil',
      },
    };
  });

  // Confirmar pago - cliente confirma que hizo el Pago Móvil
  app.post<{ Body: ConfirmPaymentBody }>('/confirm', {
    schema: {
      body: {
        type: 'object',
        required: ['reference', 'phone', 'amount'],
        properties: {
          reference: { type: 'string', minLength: 8, maxLength: 20 },
          phone: { type: 'string', pattern: '^[0-9]{11}$' },
          amount: { type: 'number', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { reference, phone, amount } = request.body;
    
    // Buscar pago pendiente
    const paymentResult = await app.db.query(`
      SELECT p.*, o.status as order_status
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      WHERE p.reference = $1 AND p.status = 'pending'
    `, [reference]);
    
    if (paymentResult.rows.length === 0) {
      return reply.status(404).send({
        error: 'Payment Not Found',
        message: 'Pago no encontrado o ya procesado',
        code: 'PAYMENT_NOT_FOUND',
      });
    }
    
    const payment = paymentResult.rows[0];
    
    // Verificar monto (tolerancia de 1%)
    const tolerance = payment.amount_bs * 0.01;
    if (Math.abs(amount - payment.amount_bs) > tolerance) {
      return reply.status(400).send({
        error: 'Amount Mismatch',
        message: `Monto incorrecto. Esperado: Bs ${payment.amount_bs.toFixed(2)}`,
        code: 'AMOUNT_MISMATCH',
      });
    }
    
    // Verificar teléfono del cliente
    const orderResult = await app.db.query(
      'SELECT customer_phone FROM orders WHERE id = $1',
      [payment.order_id]
    );
    
    if (orderResult.rows[0].customer_phone !== phone) {
      return reply.status(403).send({
        error: 'Unauthorized',
        message: 'Teléfono no corresponde a esta orden',
        code: 'PHONE_MISMATCH',
      });
    }
    
    // Actualizar estado del pago y orden
    const now = new Date().toISOString();
    
    await app.db.query(`
      UPDATE payments 
      SET status = 'confirmed', confirmed_at = $1, payer_phone = $2
      WHERE id = $1
    `, [now, phone]);
    
    await app.db.query(`
      UPDATE orders 
      SET status = 'paid', updated_at = $1
      WHERE id = $2
    `, [now, payment.order_id]);
    
    app.log.info(`✅ Pago confirmado - Ref: ${reference}`);
    
    return {
      success: true,
      message: 'Pago confirmado exitosamente',
      orderId: payment.order_id,
    };
  });

  // Verificar callback (para integraciones futuras con banco)
  app.get<{ Querystring: VerifyCallbackQuery }>('/verify-callback', {
    schema: {
      querystring: {
        type: 'object',
        required: ['reference', 'amount'],
        properties: {
          reference: { type: 'string' },
          amount: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { reference, amount } = request.query;
    
    const result = await app.db.query(`
      SELECT * FROM payments WHERE reference = $1
    `, [reference]);
    
    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Referencia no encontrada',
        code: 'REFERENCE_NOT_FOUND',
      });
    }
    
    const payment = result.rows[0];
    
    return {
      success: true,
      found: true,
      status: payment.status,
      amountBs: payment.amount_bs,
      verified: parseFloat(amount) === payment.amount_bs,
    };
  });
};