import { FastifyInstance } from 'fastify';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';

interface DriverLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

interface OrderSubscription {
  orderId: string;
  userId?: string;
}

// Mapa para guardar sockets por orden
const orderRooms = new Map<string, Set<string>>();

/**
 * Configura Socket.io con Fastify
 */
export function setupSocket(app: FastifyInstance): void {
  const server: HTTPServer = app.server as HTTPServer;
  
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  app.log.info('🔌 Socket.io configurado');

  // Autenticación simplificada para MVP (en producción usar JWT handshake)
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (token) {
      // En MVP, solo verificar que existe
      // En producción: verificar JWT y extraer userId
      socket.data.userId = token;
    }
    
    next();
  });

  io.on('connection', (socket: Socket) => {
    app.log.info(`🔗 Cliente conectado: ${socket.id}`);

    // ============================================
    // Evento: Suscribirse a actualizaciones de orden
    // ============================================
    socket.on('order:subscribe', async (data: OrderSubscription) => {
      const { orderId } = data;
      
      if (!orderId) {
        socket.emit('error', { message: 'orderId requerido' });
        return;
      }

      const room = `order_${orderId}`;
      socket.join(room);
      
      // Guardar referencia
      if (!orderRooms.has(orderId)) {
        orderRooms.set(orderId, new Set());
      }
      orderRooms.get(orderId)!.add(socket.id);
      
      app.log.info(`📦 Socket ${socket.id} unido a sala ${room}`);
      
      // Confirmar suscripción
      socket.emit('order:subscribed', { orderId });
      
      // Enviar última ubicación si existe
      try {
        const lastLocation = await app.db.query(`
          SELECT dl.*, d.name as driver_name
          FROM driver_locations dl
          JOIN deliveries del ON dl.driver_id = del.driver_id
          JOIN drivers d ON del.driver_id = d.id
          WHERE del.order_id = $1
          ORDER BY dl.recorded_at DESC
          LIMIT 1
        `, [orderId]);
        
        if (lastLocation.rows.length > 0) {
          const loc = lastLocation.rows[0];
          socket.emit('driver:location', {
            driverId: loc.driver_id,
            driverName: loc.driver_name,
            latitude: loc.latitude,
            longitude: loc.longitude,
            speed: loc.speed,
            heading: loc.heading,
            recordedAt: loc.recorded_at,
          });
        }
      } catch (err) {
        app.log.debug('No se encontró ubicación para la orden');
      }
    });

    // ============================================
    // Evento: Desuscribirse de orden
    // ============================================
    socket.on('order:unsubscribe', (data: OrderSubscription) => {
      const { orderId } = data;
      const room = `order_${orderId}`;
      socket.leave(room);
      
      if (orderRooms.has(orderId)) {
        orderRooms.get(orderId)!.delete(socket.id);
      }
      
      app.log.info(`📦 Socket ${socket.id} salió de sala ${room}`);
    });

    // ============================================
    // Evento: Recibir ubicación del repartidor (driver app)
    // ============================================
    socket.on('driver:location', async (data: DriverLocation & { driverId: string; orderId?: string }) => {
      const { driverId, latitude, longitude, accuracy, speed, heading, orderId } = data;

      // Validar datos
      if (!driverId || latitude === undefined || longitude === undefined) {
        socket.emit('error', { message: 'Datos de ubicación inválidos' });
        return;
      }

      // Guardar en base de datos
      try {
        await app.db.query(`
          INSERT INTO driver_locations (driver_id, latitude, longitude, accuracy, speed, heading)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [driverId, latitude, longitude, accuracy || null, speed || null, heading || null]);

        app.log.debug(`📍 Ubicación driver ${driverId}: ${latitude}, ${longitude}`);

        // Si hay orden asociada, emitir a los clientes suscritos
        if (orderId) {
          const room = `order_${orderId}`;
          
          // Obtener nombre del repartidor
          const driverResult = await app.db.query(
            'SELECT name FROM drivers WHERE id = $1',
            [driverId]
          );
          
          io.to(room).emit('driver:location', {
            driverId,
            driverName: driverResult.rows[0]?.name || 'Repartidor',
            latitude,
            longitude,
            speed,
            heading,
            accuracy,
            recordedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        app.log.error('Error guardando ubicación:', err);
        socket.emit('error', { message: 'Error al guardar ubicación' });
      }
    });

    // ============================================
    // Evento: Cambio de estado de entrega
    // ============================================
    socket.on('status:change', async (data: { orderId: string; status: string; description?: string }) => {
      const { orderId, status, description } = data;

      // Registrar en tracking
      try {
        await app.db.query(`
          INSERT INTO delivery_tracking (order_id, status, description)
          VALUES ($1, $2, $3)
        `, [orderId, status, description || null]);

        // Actualizar estado de entrega
        if (status === 'picked_up') {
          await app.db.query(`
            UPDATE deliveries SET picked_up_at = NOW(), status = $1, updated_at = NOW()
            WHERE order_id = $2
          `, [status, orderId]);
        } else if (status === 'delivered') {
          await app.db.query(`
            UPDATE deliveries SET delivered_at = NOW(), status = $1, updated_at = NOW()
            WHERE order_id = $2
          `, [status, orderId]);
        }

        const room = `order_${orderId}`;
        io.to(room).emit('status:changed', {
          orderId,
          status,
          description,
          updatedAt: new Date().toISOString(),
        });

        app.log.info(`📦 Orden ${orderId} -> ${status}`);
      } catch (err) {
        app.log.error('Error actualizando estado:', err);
        socket.emit('error', { message: 'Error al actualizar estado' });
      }
    });

    // Desconexión
    socket.on('disconnect', () => {
      app.log.info(`🔌 Cliente desconectado: ${socket.id}`);
      
      // Limpiar de las salas
      for (const [orderId, sockets] of orderRooms.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            orderRooms.delete(orderId);
          }
        }
      }
    });
  });

  // Guardar referencia en app para uso en otros módulos
  (app as any).io = io;
}

export { orderRooms };