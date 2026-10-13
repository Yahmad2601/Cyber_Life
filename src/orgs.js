// City layout + organisation data. Cyber Life is set in Abuja.
//
// Real organisations (real: true) are modelled from photos in /SourceImages.
// Their staff counts, posture scores and executive names are DEMO values;
// replace them with real figures once each organisation is onboarded.
// All other organisations are fictional placeholders.
//
// Blender: blender/build_landmarks.py builds public/models/<id>.glb for every
// org; keep its LAYOUT table in sync with `cell`/`span` here.

export const CELL = 14; // world units per city block (10.4 block + roads)

export const DISTRICTS = {
  maitama: { name: 'Maitama', color: '#e2ead2', i: [-5, 5], j: [-4, -2], heights: [4, 10] },
  cbd: { name: 'Central Business District', color: '#ecdcd8', i: [-5, 5], j: [-1, 1], heights: [5, 14] },
  wuse: { name: 'Wuse II', color: '#efe2c8', i: [-5, 5], j: [2, 4], heights: [4, 12] },
};

// Aso Rock backdrop, placed behind the city as seen from the default camera.
export const ASO_ROCK = { position: [-115, -0.6, -125], rotationY: 0 };

export const ORGS = [
  // --- Real Abuja landmarks -------------------------------------------------
  { id: 'nrs', real: true, name: 'Nigeria Revenue Service', short: 'NRS', sector: 'Revenue Authority', district: 'cbd', cell: [0, 0], type: 'slab', height: 46, color: '#4f8fd8', accent: '#d71920', domain: 'nrs.gov.ng', staff: 2800, ceo: 'Amina Lawal', posture: 64 },
  { id: 'galaxy-backbone', real: true, name: 'Galaxy Backbone', short: 'GBB', sector: 'Government ICT', district: 'cbd', cell: [2, 0], span: [2, 1], type: 'twin', height: 24, color: '#4b4039', accent: '#c47a52', domain: 'galaxybackbone.com.ng', staff: 900, ceo: 'Musa Danladi', posture: 72 },
  { id: 'taj-bank', real: true, name: 'TAJBank', short: 'TAJ', sector: 'Non-interest Banking', district: 'maitama', cell: [-1, -3], type: 'slab', height: 14, color: '#4a4d52', accent: '#d71f26', domain: 'tajbank.com', staff: 600, ceo: 'Yusuf Abdullahi', posture: 58 },

  // --- Fictional tenants ----------------------------------------------------
  { id: 'reserve-authority', name: 'National Reserve Authority', short: 'NRA', sector: 'Regulator', district: 'cbd', cell: [-2, 0], type: 'stepped', height: 40, color: '#8d6e63', accent: '#2e7d32', domain: 'nra.demo.gov.ng', staff: 2400, ceo: 'Aliyu Danjuma', posture: 74 },
  { id: 'min-finance', name: 'Ministry of Finance (demo)', short: 'MoF', sector: 'Government', district: 'cbd', cell: [-4, 1], type: 'civic', height: 12, color: '#e8e0d0', accent: '#2e7d32', domain: 'finance.demo.gov.ng', staff: 1500, ceo: 'Hauwa Bello', posture: 47 },
  { id: 'min-digital', name: 'Ministry of Digital Economy (demo)', short: 'MoDE', sector: 'Government', district: 'cbd', cell: [5, 0], type: 'civic', height: 12, color: '#e3e6ee', accent: '#1565c0', domain: 'digital.demo.gov.ng', staff: 900, ceo: 'Emeka Nwosu', posture: 66 },
  { id: 'atlantic-trust', name: 'Atlantic Trust Bank', short: 'ATB', sector: 'Banking', district: 'maitama', cell: [-4, -3], type: 'twin', height: 36, color: '#3d6f8e', accent: '#f2b134', domain: 'atlantictrust.ng', staff: 4200, ceo: 'Babajide Adeyemi', posture: 62 },
  { id: 'maitama-capital', name: 'Maitama Capital Group', short: 'MCG', sector: 'Investment Banking', district: 'maitama', cell: [2, -3], type: 'stepped', height: 44, color: '#c86f4a', accent: '#2f4858', domain: 'maitamacapital.ng', staff: 1800, ceo: 'Ngozi Eze', posture: 71 },
  { id: 'zuma-mutual', name: 'Zuma Mutual Assurance', short: 'ZMA', sector: 'Insurance', district: 'maitama', cell: [4, -2], type: 'cylinder', height: 30, color: '#7a9e7e', accent: '#f4f1de', domain: 'zumamutual.ng', staff: 950, ceo: 'Tunde Bakare', posture: 55 },
  { id: 'naira-pay', name: 'NairaPay', short: 'NPAY', sector: 'Fintech', district: 'wuse', cell: [-3, 3], type: 'prism', height: 30, color: '#5b5f97', accent: '#ffc145', domain: 'nairapay.ng', staff: 600, ceo: 'Chiamaka Obi', posture: 68 },
  { id: 'savanna-tel', name: 'SavannaTel', short: 'STEL', sector: 'Telecoms', district: 'wuse', cell: [0, 3], type: 'spire', height: 48, color: '#2a9d8f', accent: '#e76f51', domain: 'savannatel.ng', staff: 5100, ceo: 'Ibrahim Musa', posture: 59 },
  { id: 'delta-energy', name: 'Delta Energy Plc', short: 'DEP', sector: 'Oil & Gas', district: 'wuse', cell: [3, 3], type: 'slab', height: 34, color: '#6d597a', accent: '#e9c46a', domain: 'deltaenergy.ng', staff: 3300, ceo: 'Folake Johnson', posture: 50 },
];

// Cells covered by an org (multi-block orgs use `span: [cols, rows]`).
export function orgCells(o) {
  const [sx, sy] = o.span || [1, 1];
  const cells = [];
  for (let di = 0; di < sx; di++) for (let dj = 0; dj < sy; dj++) cells.push([o.cell[0] + di, o.cell[1] + dj]);
  return cells;
}

// World-space centre of an org's footprint.
export function orgCenter(o) {
  const [sx, sy] = o.span || [1, 1];
  return [(o.cell[0] + (sx - 1) / 2) * CELL, (o.cell[1] + (sy - 1) / 2) * CELL];
}
