// City layout + organisation data.
// All organisations below are FICTIONAL placeholders. Swap in real tenants
// (names, logos, domains) only once each organisation has signed on.

export const CELL = 14; // world units per city block (10 block + 4 road)

export const DISTRICTS = {
  marina: { name: 'Marina Financial District', color: '#efe2c8', i: [-5, -1], j: [-4, 0], heights: [6, 20] },
  vi: { name: 'Victoria Island Tech Corridor', color: '#e2ead2', i: [1, 5], j: [-4, 0], heights: [5, 16] },
  cbd: { name: 'Central Business District', color: '#ecdcd8', i: [-4, 4], j: [2, 4], heights: [4, 10] },
};

// Road-aligned bridges between districts: [x0, x1, z0, z1] in world units.
export const BRIDGES = [
  [-0.5 * CELL, 0.5 * CELL, -1.5 * CELL, -1.5 * CELL], // Marina <-> VI
  [-1.5 * CELL, -1.5 * CELL, 0.5 * CELL, 1.5 * CELL], // Marina <-> CBD
  [1.5 * CELL, 1.5 * CELL, 0.5 * CELL, 1.5 * CELL], // VI <-> CBD
];

export const ORGS = [
  { id: 'atlantic-trust', name: 'Atlantic Trust Bank', short: 'ATB', sector: 'Banking', district: 'marina', cell: [-4, -3], type: 'twin', height: 36, color: '#3d6f8e', accent: '#f2b134', domain: 'atlantictrust.ng', staff: 4200, ceo: 'Babajide Adeyemi', posture: 62 },
  { id: 'marina-capital', name: 'Marina Capital Group', short: 'MCG', sector: 'Investment Banking', district: 'marina', cell: [-2, -2], type: 'stepped', height: 44, color: '#c86f4a', accent: '#2f4858', domain: 'marinacapital.ng', staff: 1800, ceo: 'Ngozi Eze', posture: 71 },
  { id: 'eko-mutual', name: 'Eko Mutual Assurance', short: 'EKO', sector: 'Insurance', district: 'marina', cell: [-4, -1], type: 'cylinder', height: 30, color: '#7a9e7e', accent: '#f4f1de', domain: 'ekomutual.ng', staff: 950, ceo: 'Tunde Bakare', posture: 55 },
  { id: 'naira-pay', name: 'NairaPay', short: 'NPAY', sector: 'Fintech', district: 'vi', cell: [2, -3], type: 'prism', height: 30, color: '#5b5f97', accent: '#ffc145', domain: 'nairapay.ng', staff: 600, ceo: 'Chiamaka Obi', posture: 68 },
  { id: 'lagoon-tel', name: 'LagoonTel', short: 'LTEL', sector: 'Telecoms', district: 'vi', cell: [4, -2], type: 'spire', height: 48, color: '#2a9d8f', accent: '#e76f51', domain: 'lagoontel.ng', staff: 5100, ceo: 'Ibrahim Musa', posture: 59 },
  { id: 'delta-energy', name: 'Delta Energy Plc', short: 'DEP', sector: 'Oil & Gas', district: 'vi', cell: [2, -1], type: 'slab', height: 34, color: '#6d597a', accent: '#e9c46a', domain: 'deltaenergy.ng', staff: 3300, ceo: 'Folake Johnson', posture: 50 },
  { id: 'reserve-authority', name: 'National Reserve Authority', short: 'NRA', sector: 'Regulator', district: 'cbd', cell: [0, 3], type: 'stepped', height: 40, color: '#8d6e63', accent: '#2e7d32', domain: 'nra.gov.ng', staff: 2400, ceo: 'Aliyu Danjuma', posture: 74 },
  { id: 'min-finance', name: 'Ministry of Finance (demo)', short: 'MoF', sector: 'Government', district: 'cbd', cell: [-3, 3], type: 'civic', height: 12, color: '#e8e0d0', accent: '#2e7d32', domain: 'finance.demo.gov.ng', staff: 1500, ceo: 'Hauwa Bello', posture: 47 },
  { id: 'min-digital', name: 'Ministry of Digital Economy (demo)', short: 'MoDE', sector: 'Government', district: 'cbd', cell: [3, 3], type: 'civic', height: 12, color: '#e3e6ee', accent: '#1565c0', domain: 'digital.demo.gov.ng', staff: 900, ceo: 'Emeka Nwosu', posture: 66 },
];
