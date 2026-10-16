export interface ParsedQuery {
  text: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  part: string | null;
}

// Mapeo de marcas conocidas
const KNOWN_BRANDS = [
  'chevrolet', 'ford', 'toyota', 'hyundai', 'kia', 'nissan', 'mazda',
  'volkswagen', 'honda', 'mitsubishi', 'suzuki', 'renault', 'peugeot',
  'fiat', 'jeep', 'dodge', 'bmw', 'mercedes', 'audi', 'corolla', 'corsa',
  'aveo', 'spark', 'sail', 'optra', 'challenger', 'mustang', 'focus',
  ' civic', 'corolla', 'yaris', 'sentra', 'march', 'versailles', 'logus',
];

// Modelos comunes para extraer
const COMMON_MODELS = [
  'corsa', 'aveo', 'spark', 'sail', 'optra', 'corolla', 'yaris', 'sentra',
  'march', 'challenger', 'mustang', 'focus', 'civic', 'cruze', 'sonic',
  'fiesta', 'ka', 'gol', 'polo', 'logan', 'sandero', 'duster', 'oroch',
];

/**
 * Parsea una query natural y extrae:
 * - Texto de búsqueda (pieza)
 * - Marca del vehículo
 * - Modelo del vehículo
 * - Año del vehículo
 * 
 * Ejemplos:
 * - "pastillas de freno corsa 2015" -> { text: "pastillas de freno", brand: "chevrolet", model: "corsa", year: 2015 }
 * - "bujías para spark" -> { text: "bujías", brand: "chevrolet", model: "spark", year: null }
 */
export function parseNaturalQuery(input: string): ParsedQuery {
  const result: ParsedQuery = {
    text: '',
    brand: null,
    model: null,
    year: null,
    part: null,
  };
  
  if (!input || input.trim().length === 0) {
    return result;
  }
  
  // Limpiar y lowercase
  const clean = input.toLowerCase().trim();
  const tokens = clean.split(/\s+/);
  const remaining: string[] = [];
  
  // Extraer año (4 dígitos entre 1900 y 2030)
  const yearMatch = clean.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    result.year = parseInt(yearMatch[1], 10);
  }
  
  // Extraer marca
  for (const brand of KNOWN_BRANDS) {
    if (clean.includes(brand)) {
      result.brand = brand.charAt(0).toUpperCase() + brand.slice(1);
      break;
    }
  }
  
  // Extraer modelo
  for (const model of COMMON_MODELS) {
    if (clean.includes(model)) {
      result.model = model.charAt(0).toUpperCase() + model.slice(1);
      // Remover modelo del texto para que no apareza en búsqueda
      break;
    }
  }
  
  // El texto restante es la pieza a buscar
  let textTokens = tokens.filter(t => {
    // Excluir años
    if (/^(19\d{2}|20\d{2})$/.test(t)) return false;
    // Excluir conectores comunes
    if (['para', 'de', 'del', 'con', 'en', 'el', 'la', 'los', 'las'].includes(t)) return false;
    return true;
  });
  
  // Limpiar tokens restantes de marca/modelo
  textTokens = textTokens.filter(t => {
    const lower = t.toLowerCase();
    if (result.brand && lower.includes(result.brand.toLowerCase())) return false;
    if (result.model && lower.includes(result.model.toLowerCase())) return false;
    return true;
  });
  
  result.text = textTokens.join(' ');
  result.part = result.text;
  
  return result;
}