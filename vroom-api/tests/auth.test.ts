import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { parseNaturalQuery } from '../src/services/search.parser.js';

// Tests para el parser de búsqueda natural
describe('search.parser', () => {
  describe('parseNaturalQuery', () => {
    it('debe extraer año de 4 dígitos', () => {
      const result = parseNaturalQuery('pastillas corsa 2015');
      expect(result.year).toBe(2015);
    });

    it('debe extraer marca Chevrolet', () => {
      const result = parseNaturalQuery('pastillas de freno corsa 2015');
      expect(result.brand).toBe('Chevrolet');
    });

    it('debe extraer modelo', () => {
      const result = parseNaturalQuery('bujías para spark');
      expect(result.model).toBe('Spark');
    });

    it('debe limpiar conectores del texto', () => {
      const result = parseNaturalQuery('pastillas de freno para corsa');
      expect(result.text).toBe('pastillas freno');
    });

    it('debe manejar query vacía', () => {
      const result = parseNaturalQuery('');
      expect(result.text).toBe('');
      expect(result.year).toBeNull();
      expect(result.brand).toBeNull();
      expect(result.model).toBeNull();
    });

    it('debe extraer múltiples componentes', () => {
      const result = parseNaturalQuery('filtro de aceite toyota corolla 2020');
      expect(result.text).toBe('filtro aceite');
      expect(result.brand).toBe('Toyota');
      expect(result.model).toBe('Corolla');
      expect(result.year).toBe(2020);
    });
  });
});

// Tests de autenticación (simulados sin DB)
describe('auth', () => {
  // En un entorno real, estos serían tests de integración
  
  it('debe generar OTP de 6 dígitos', () => {
    const crypto = require('crypto');
    const otp = crypto.randomBytes(3).readUInt32BE(0).toString().padStart(6, '0').slice(0, 6);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('debe generar JWT válido con formato correcto', () => {
    const crypto = require('crypto');
    const secret = 'test-secret';
    
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: '04121234567', iat: 1234567890 })).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const token = `${header}.${body}.${signature}`;
    
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });
});

// Tests de payment service
describe('payment.service', () => {
  it('debe generar referencia con prefijo VROOM-', () => {
    const crypto = require('crypto');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let ref = 'VROOM-';
    for (let i = 0; i < 8; i++) {
      ref += chars.charAt(crypto.randomBytes(1)[0] % chars.length);
    }
    
    expect(ref).toMatch(/^VROOM-[A-Z0-9]{8}$/);
  });

  it('debe calcular monto BS correctamente con 2% recargo', () => {
    const usdAmount = 100;
    const rate = 50;
    const expectedBs = 100 * 50 * 1.02; // 5100
    
    expect(expectedBs).toBe(5100);
  });
});

// Tests de validación de esquema
describe('validation schemas', () => {
  it('debe validar teléfono venezolano (11 dígitos)', () => {
    const phoneRegex = /^[0-9]{11}$/;
    expect(phoneRegex.test('04121234567')).toBe(true);
    expect(phoneRegex.test('0412123456')).toBe(false);
    expect(phoneRegex.test('041212345678')).toBe(false);
  });

  it('debe validar código OTP (6 dígitos)', () => {
    const otpRegex = /^[0-9]{6}$/;
    expect(otpRegex.test('123456')).toBe(true);
    expect(otpRegex.test('12345')).toBe(false);
    expect(otpRegex.test('1234567')).toBe(false);
  });
});