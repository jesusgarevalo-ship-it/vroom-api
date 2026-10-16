// Tipos para VROOM Repuestos Express MVP

// ============================================
// USER
// ============================================
export interface User {
  id: string;
  phone: string;
  name?: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
  isVerified: boolean;
}

// ============================================
// SUPPLIER
// ============================================
export interface Supplier {
  id: string;
  businessName: string;
  rif: string;
  ownerName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city: string;
  state?: string;
  logoUrl?: string;
  rating: number;
  totalReviews: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// PRODUCT
// ============================================
export interface Product {
  id: string;
  supplierId: string;
  sku?: string;
  name: string;
  description?: string;
  category: string;
  priceUsd: number;
  priceBs?: number;
  stock: number;
  imageUrl?: string;
  images?: string[];
  brand?: string;
  partNumber?: string;
  warrantyDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  supplier?: Partial<Supplier>;
  compatibility?: VehicleCompatibility[];
}

export interface VehicleCompatibility {
  brand: string;
  model: string;
  yearFrom: number;
  yearTo: number;
  engine?: string;
}

// ============================================
// ORDER
// ============================================
export type OrderStatus = 
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'in_transit'
  | 'delivered'
  | 'cancelled';

export interface Order {
  id: string;
  userId?: string;
  supplierId?: string;
  status: OrderStatus;
  totalUsd: number;
  deliveryAddress: string;
  city: string;
  customerName: string;
  customerPhone: string;
  notes?: string;
  estimatedDelivery?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  items?: OrderItem[];
  driver?: Partial<Driver>;
  tracking?: DeliveryTracking;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  priceUsd: number;
  createdAt: Date;
  // Joined
  product?: Partial<Product>;
}

// ============================================
// PAYMENT
// ============================================
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';

export interface Payment {
  id: string;
  orderId: string;
  reference: string;
  amountUsd: number;
  amountBs: number;
  rateUsed: number;
  status: PaymentStatus;
  payerPhone?: string;
  confirmedAt?: Date;
  createdAt: Date;
}

// ============================================
// DRIVER
// ============================================
export interface Driver {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  email?: string;
  vehicleId?: string;
  licensePlate?: string;
  isActive: boolean;
  rating: number;
  totalDeliveries: number;
  createdAt: Date;
  updatedAt: Date;
  // Joined
  vehicle?: Partial<Vehicle>;
}

export interface Vehicle {
  id: string;
  plate: string;
  model?: string;
  brand?: string;
  year?: number;
  type?: 'moto' | 'carro' | 'van';
  isActive: boolean;
  createdAt: Date;
}

// ============================================
// DELIVERY
// ============================================
export type DeliveryStatus = 'assigned' | 'picked_up' | 'in_transit' | 'delivered';

export interface Delivery {
  id: string;
  orderId: string;
  driverId?: string;
  status: DeliveryStatus;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Joined
  driver?: Partial<Driver>;
  order?: Partial<Order>;
}

export interface DriverLocation {
  id: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  recordedAt: Date;
}

export interface DeliveryTracking {
  id: string;
  orderId: string;
  status: string;
  locationLat?: number;
  locationLng?: number;
  description?: string;
  createdBy?: string;
  createdAt: Date;
}

// ============================================
// API RESPONSE
// ============================================
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// ============================================
// AUTH
// ============================================
export interface JwtPayload {
  sub: string;  // phone
  jti: string;
  iat: number;
  exp: number;
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ============================================
// SEARCH
// ============================================
export interface SearchQuery {
  q?: string;
  city?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface ParsedSearchQuery {
  text: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  part: string | null;
}