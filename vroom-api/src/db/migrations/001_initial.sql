-- ============================================
-- VROOM REPUESTOS EXPRESS - SCHEMA MVP
-- Versión: 1.0.0
-- Fecha: 2024
-- ============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- Búsqueda fuzzy

-- ============================================
-- TABLA: users (Clientes)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    email VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- ============================================
-- TABLA: suppliers (Proveedores/Talleres)
-- ============================================
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name VARCHAR(200) NOT NULL,
    rif VARCHAR(20) UNIQUE NOT NULL,
    owner_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(50) NOT NULL,
    state VARCHAR(50) DEFAULT 'Distrito Capital',
    logo_url TEXT,
    rating DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_city ON suppliers(city);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- ============================================
-- TABLA: products (Productos/Repuestos)
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    sku VARCHAR(50) UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL,
    price_usd DECIMAL(10,2) NOT NULL,
    price_bs DECIMAL(20,2),
    stock INTEGER DEFAULT 0,
    image_url TEXT,
    images TEXT[],  -- Array de URLs
    brand VARCHAR(50),
    part_number VARCHAR(50),
    warranty_days INTEGER DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    search_vector TSVECTOR,  -- Para búsqueda full-text
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para productos
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price_usd);
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_products_trgm ON products USING GIN(name gin_trgm_ops);

-- Trigger para actualizar search_vector
CREATE OR REPLACE FUNCTION products_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('spanish', COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.category, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_search_vector_trigger ON products;
CREATE TRIGGER products_search_vector_trigger
    BEFORE INSERT OR UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();

-- ============================================
-- TABLA: product_compatibility (Compatibilidad vehículo)
-- ============================================
CREATE TABLE IF NOT EXISTS product_compatibility (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    brand VARCHAR(50) NOT NULL,
    model VARCHAR(50) NOT NULL,
    year_from INTEGER NOT NULL,
    year_to INTEGER NOT NULL,
    engine VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, brand, model, year_from, year_to)
);

CREATE INDEX IF NOT EXISTS idx_compat_product ON product_compatibility(product_id);
CREATE INDEX IF NOT EXISTS idx_compat_vehicle ON product_compatibility(brand, model);
CREATE INDEX IF NOT EXISTS idx_compat_year ON product_compatibility(year_from, year_to);

-- ============================================
-- TABLA: orders (Órdenes)
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,  -- UUID string
    user_id UUID REFERENCES users(id),
    supplier_id UUID REFERENCES suppliers(id),
    status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
    -- Estados: pending_payment, paid, processing, in_transit, delivered, cancelled
    total_usd DECIMAL(10,2) NOT NULL,
    delivery_address TEXT NOT NULL,
    city VARCHAR(50) NOT NULL,
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    notes TEXT,
    estimated_delivery TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_supplier ON orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- ============================================
-- TABLA: order_items (Items de orden)
-- ============================================
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    price_usd DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ============================================
-- TABLA: payments (Pagos Pago Móvil)
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id),
    reference VARCHAR(20) UNIQUE NOT NULL,
    amount_usd DECIMAL(10,2) NOT NULL,
    amount_bs DECIMAL(20,2) NOT NULL,
    rate_used DECIMAL(10,4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Estados: pending, confirmed, failed, refunded
    payer_phone VARCHAR(20),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ============================================
-- TABLA: drivers (Repartidores)
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    vehicle_id UUID,
    license_plate VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    rating DECIMAL(3,2) DEFAULT 5.00,
    total_deliveries INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drivers_active ON drivers(is_active);

-- ============================================
-- TABLA: vehicles (Vehículos de reparto)
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plate VARCHAR(10) UNIQUE NOT NULL,
    model VARCHAR(50),
    brand VARCHAR(30),
    year INTEGER,
    type VARCHAR(20),  -- moto, carro, van
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);

-- ============================================
-- TABLA: deliveries (Entregas)
-- ============================================
CREATE TABLE IF NOT EXISTS deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(36) NOT NULL UNIQUE REFERENCES orders(id),
    driver_id UUID REFERENCES drivers(id),
    status VARCHAR(30) NOT NULL DEFAULT 'assigned',
    -- Estados: assigned, picked_up, in_transit, delivered
    picked_up_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);

-- ============================================
-- TABLA: driver_locations (Ubicación GPS en tiempo real)
-- ============================================
CREATE TABLE IF NOT EXISTS driver_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id UUID NOT NULL REFERENCES drivers(id),
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    accuracy DECIMAL(6,2),
    speed DECIMAL(6,2),
    heading DECIMAL(5,2),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_loc_driver ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_loc_time ON driver_locations(recorded_at DESC);

-- ============================================
-- TABLA: delivery_tracking (Historial de estado)
-- ============================================
CREATE TABLE IF NOT EXISTS delivery_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id),
    status VARCHAR(30) NOT NULL,
    location_lat DECIMAL(10,8),
    location_lng DECIMAL(11,8),
    description TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_order ON delivery_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_created ON delivery_tracking(created_at DESC);

-- ============================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_suppliers_updated_at ON suppliers;
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deliveries_updated_at ON deliveries;
CREATE TRIGGER update_deliveries_updated_at BEFORE UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_drivers_updated_at ON drivers;
CREATE TRIGGER update_drivers_updated_at BEFORE UPDATE ON drivers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DATOS SEED (comentados para MVP)
-- ============================================
-- INSERT INTO suppliers (business_name, rif, city) VALUES 
-- ('AutoPartes Caracas', 'J-12345678-9', 'Caracas'),
-- ('FrenosExpress', 'J-87654321-0', 'Maracaibo');

-- INSERT INTO categories (name, icon) VALUES 
-- ('Frenos', 'brake'),
-- ('Motor', 'engine'),
-- ('Suspensión', 'suspension');

COMMENT ON TABLE users IS 'Clientes de la aplicación';
COMMENT ON TABLE suppliers IS 'Proveedores y talleres mecánicos';
COMMENT ON TABLE products IS 'Productos/repuestos en venta';
COMMENT ON TABLE orders IS 'Órdenes de compra';
COMMENT ON TABLE payments IS 'Registros de Pago Móvil';
COMMENT ON TABLE drivers IS 'Repartidores registrados';
COMMENT ON TABLE deliveries IS 'Entregas activas y completadas';
COMMENT ON TABLE driver_locations IS 'Historial GPS de repartidores';