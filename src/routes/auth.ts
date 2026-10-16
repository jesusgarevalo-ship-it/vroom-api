import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import crypto from 'crypto';
import { createHmac, randomBytes } from 'crypto';

interface SendOtpBody {
  phone: string;
}

interface VerifyOtpBody {
  phone: string;
  code: string;
}

interface RefreshBody {
  refreshToken: string;
}

// Rate limit: 5 OTP por hora por teléfono
const OTP_RATE_LIMIT = 5;
const OTP_TTL = 300; // 5 minutos

function generateOtp(): string {
  return randomBytes(3).readUInt32BE(0).toString().padStart(6, '0').slice(0, 6);
}

function signJwt(payload: object, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyJwt(token: string, secret: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const [header, body, sig] = token.split('.');
    const expectedSig = createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    
    if (sig !== expectedSig) return { valid: false };
    
    return { valid: true, payload: JSON.parse(Buffer.from(body, 'base64url').toString()) };
  } catch {
    return { valid: false };
  }
}

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Enviar OTP
  app.post<{ Body: SendOtpBody }>('/send-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', pattern: '^[0-9]{11}$' },
        },
      },
    },
  }, async (request, reply) => {
    const { phone } = request.body;
    const rateKey = `ratelimit:otp:${phone}`;
    
    // Verificar rate limit
    const currentCount = await app.redis.incr(rateKey);
    if (currentCount === 1) {
      await app.redis.expire(rateKey, 3600); // 1 hora
    }
    
    if (currentCount > OTP_RATE_LIMIT) {
      return reply.status(429).send({
        error: 'Rate Limit Exceeded',
        message: 'Demasiados intentos. Intenta de nuevo en una hora.',
        code: 'OTP_RATE_LIMIT',
      });
    }
    
    const otp = generateOtp();
    const otpKey = `otp:${phone}`;
    
    // Guardar OTP en Redis (5 min TTL)
    await app.redis.setex(otpKey, OTP_TTL, otp);
    
    // En MVP, solo loguear el OTP (no SMS real)
    app.log.info(`📱 OTP para ${phone}: ${otp}`);
    
    return {
      success: true,
      message: 'Código enviado',
      // En producción, remover esto:
      // demo: true,
      // code: otp,
    };
  });

  // Verificar OTP
  app.post<{ Body: VerifyOtpBody }>('/verify-otp', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', pattern: '^[0-9]{11}$' },
          code: { type: 'string', minLength: 6, maxLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { phone, code } = request.body;
    const otpKey = `otp:${phone}`;
    
    const storedOtp = await app.redis.get(otpKey);
    
    if (!storedOtp || storedOtp !== code) {
      return reply.status(401).send({
        error: 'Invalid OTP',
        message: 'Código inválido o expirado',
        code: 'INVALID_OTP',
      });
    }
    
    // Eliminar OTP usado
    await app.redis.del(otpKey);
    
    // Generar JWT
    const jwtSecret = process.env.JWT_SECRET || 'vroom-secret-key-change-in-production';
    const jti = randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    
    const accessToken = signJwt({
      sub: phone,
      jti,
      iat: now,
      exp: now + 3600, // 1 hora
      type: 'access',
    }, jwtSecret);
    
    const refreshToken = signJwt({
      sub: phone,
      jti,
      iat: now,
      exp: now + 604800, // 7 días
      type: 'refresh',
    }, jwtSecret);
    
    // Guardar jti en Redis para blacklist de refresh tokens
    await app.redis.setex(`jti:${jti}`, 604800, '1');
    
    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
    };
  });

  // Refrescar token
  app.post<{ Body: RefreshBody }>('/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body;
    const jwtSecret = process.env.JWT_SECRET || 'vroom-secret-key-change-in-production';
    
    const { valid, payload } = verifyJwt(refreshToken, jwtSecret);
    
    if (!valid || payload?.type !== 'refresh') {
      return reply.status(401).send({
        error: 'Invalid Token',
        message: 'Token de refresco inválido',
        code: 'INVALID_TOKEN',
      });
    }
    
    const jti = payload.jti as string;
    const phone = payload.sub as string;
    
    // Verificar que el token no ha sido revocado
    const exists = await app.redis.exists(`jti:${jti}`);
    if (!exists) {
      return reply.status(401).send({
        error: 'Token Revoked',
        message: 'Token ha sido revocado',
        code: 'TOKEN_REVOKED',
      });
    }
    
    // Rotar: marcar viejo jti como usado
    await app.redis.del(`jti:${jti}`);
    
    // Generar nuevo par de tokens
    const newJti = randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    
    const newAccessToken = signJwt({
      sub: phone,
      jti: newJti,
      iat: now,
      exp: now + 3600,
      type: 'access',
    }, jwtSecret);
    
    const newRefreshToken = signJwt({
      sub: phone,
      jti: newJti,
      iat: now,
      exp: now + 604800,
      type: 'refresh',
    }, jwtSecret);
    
    await app.redis.setex(`jti:${newJti}`, 604800, '1');
    
    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
    };
  });
};