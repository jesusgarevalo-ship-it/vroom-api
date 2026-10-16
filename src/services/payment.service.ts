import crypto from 'crypto';

const BCV_API_URL = 'https://s3.amazonaws.com/assets.bcv.org.ve/servicio/VentaDolar';
const FALLBACK_RATE = parseFloat(process.env.BCV_FALLBACK_RATE || '50');

/**
 * Genera una referencia única para Pago Móvil
 * Formato: VROOM-XXXXXXXX (8 caracteres alfanuméricos)
 */
export function generateReference(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I, O, 0, 1 para evitar confusiones
  let ref = 'VROOM-';
  
  for (let i = 0; i < 8; i++) {
    ref += chars.charAt(crypto.randomBytes(1)[0] % chars.length);
  }
  
  return ref;
}

/**
 * Obtiene la tasa BCV desde el API oficial
 * Retorna fallback si falla
 */
export async function getBcvRate(): Promise<number> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(BCV_API_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.warn(`⚠️ BCV API error: ${response.status}`);
      return FALLBACK_RATE;
    }
    
    const data = await response.json() as { dolar: Array<{ valor: string }> };
    
    if (data.dolar && data.dolar.length > 0) {
      const rate = parseFloat(data.dolar[0].valor);
      if (!isNaN(rate) && rate > 0) {
        console.log(`📊 Tasa BCV: ${rate} Bs/USD`);
        return rate;
      }
    }
    
    console.warn('⚠️ BCV API returned invalid data');
    return FALLBACK_RATE;
  } catch (err) {
    console.warn('⚠️ BCV API unavailable, usando fallback:', FALLBACK_RATE);
    return FALLBACK_RATE;
  }
}

/**
 * Calcula el monto en Bolívares incluyendo recargo del 2%
 * @param usdAmount Monto en dólares USD
 * @returns Monto en Bs con 2% de recargo
 */
export async function calculateBsAmount(usdAmount: number): Promise<number> {
  const rate = await getBcvRate();
  const bsAmount = usdAmount * rate;
  const withRecargo = bsAmount * 1.02; // 2% recargo por fluctuate
  return Math.round(withRecargo * 100) / 100;
}

/**
 * Verifica si un pago existe y coincide con la referencia y monto
 */
export async function verifyPayment(
  paymentId: string,
  reference: string,
  expectedAmount: number
): Promise<{ valid: boolean; payment?: any }> {
  // Esta función se usa para verificar pagos desde la base de datos
  // La implementación real está en payments.ts
  return { valid: false };
}