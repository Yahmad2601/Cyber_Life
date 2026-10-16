// City layout + organisation data. Cyber Life is set in Abuja.
//
// Real organisations (real: true) are modelled from photos in /SourceImages.
// Their staff counts, posture scores, executive names and some domains are
// DEMO values; replace them with real figures once each organisation is
// onboarded. All other organisations are fictional placeholders.
//
// Blender: blender/build_landmarks.py builds public/models/<id>.glb for every
// org and landmark; keep its LAYOUT table in sync with `cell`/`span` here.
// Camera note: the default view looks from +x/+z, so tall buildings with a
// larger i + j stand in front of whatever shares their i - j diagonal.

export const CELL = 14; // world units per city block (10.4 block + roads)

export const DISTRICTS = {
  // parks: share of empty blocks left as green space (Abuja's CBD is very open)
  maitama: { name: 'Maitama', color: '#e2ead2', i: [-5, 5], j: [-4, -2], heights: [4, 10], parks: 0.15 },
  cbd: { name: 'Central Business District', color: '#ecdcd8', i: [-5, 5], j: [-1, 1], heights: [3, 7], parks: 0.5 },
  garki: { name: 'Garki', color: '#efe2c8', i: [-5, 5], j: [2, 4], heights: [3, 8], parks: 0.25 },
};

// Aso Rock backdrop, placed behind the city as seen from the default camera.
export const ASO_ROCK = { position: [-115, -0.6, -125], rotationY: 0 };

// Airport Road: two one-way carriageways leave the city's south edge with the
// City Gate between them. Traffic drives on the right, so the east carriageway
// carries vehicles entering the city and the west one carries those leaving.
export const AIRPORT_ROAD = {
  z0: 63,
  z1: 260,
  carriageways: [
    { x: 7, dir: -1, name: 'inbound' }, // dir: -1 = towards the city (decreasing z)
    { x: -35, dir: 1, name: 'outbound' },
  ],
};

export const ORGS = [
  // --- Real Abuja organisations --------------------------------------------
  { id: 'cbn', real: true, name: 'Central Bank of Nigeria', short: 'CBN', sector: 'Central Bank', district: 'cbd', cell: [-2, -1], span: [2, 1], type: 'stepped', height: 34, color: '#2e3f63', accent: '#1f8a4c', domain: 'cbn.gov.ng', staff: 6500, ceo: 'Kabiru Sani', posture: 70 },
  { id: 'nnpc', real: true, name: 'NNPC Limited', short: 'NNPC', sector: 'Oil & Gas', district: 'cbd', cell: [0, -1], span: [2, 2], type: 'twin', height: 44, color: '#cdb9a0', accent: '#9c3b2a', domain: 'nnpcgroup.com', staff: 8000, ceo: 'Bala Garba', posture: 61 },
  { id: 'wtc', real: true, name: 'World Trade Center Abuja', short: 'WTC', sector: 'Commercial Real Estate', district: 'cbd', cell: [2, 0], span: [2, 1], type: 'twin', height: 50, color: '#3b4a5c', accent: '#aeb7c0', domain: 'wtcabuja.com', staff: 450, ceo: 'Rita Okoro', posture: 57 },
  { id: 'galaxy-backbone', real: true, name: 'Galaxy Backbone', short: 'GBB', sector: 'Government ICT', district: 'cbd', cell: [2, 1], span: [2, 1], type: 'twin', height: 24, color: '#4b4039', accent: '#c47a52', domain: 'galaxybackbone.com.ng', staff: 900, ceo: 'Musa Danladi', posture: 72 },
  { id: 'nrs', real: true, name: 'Nigeria Revenue Service', short: 'NRS', sector: 'Revenue Authority', district: 'cbd', cell: [4, -1], type: 'slab', height: 46, color: '#4f8fd8', accent: '#d71920', domain: 'nrs.gov.ng', staff: 2800, ceo: 'Amina Lawal', posture: 64 },
  { id: 'ship-house', real: true, name: 'Ministry of Defence (Ship House)', short: 'MoD', sector: 'Government', district: 'garki', cell: [-1, 3], span: [3, 1], type: 'slab', height: 22, color: '#e8dcc0', accent: '#cfae7f', domain: 'defence.gov.ng', staff: 3000, ceo: 'Sadiq Umar', posture: 53 },
  { id: 'taj-bank', real: true, name: 'TAJBank', short: 'TAJ', sector: 'Non-interest Banking', district: 'maitama', cell: [-1, -3], type: 'slab', height: 14, color: '#4a4d52', accent: '#d71f26', domain: 'tajbank.com', staff: 600, ceo: 'Yusuf Abdullahi', posture: 58 },
  { id: 'nirsal', real: true, name: 'NIRSAL Plc', short: 'NIRSAL', sector: 'Agricultural Finance', district: 'cbd', cell: [-4, 1], span: [2, 1], type: 'slab', height: 15, color: '#c9a96b', accent: '#1e7a3c', domain: 'nirsal.com', staff: 700, ceo: 'Aliyu Mohammed', posture: 60 },

  // --- Fictional tenants ----------------------------------------------------
  { id: 'min-finance', name: 'Ministry of Finance (demo)', short: 'MoF', sector: 'Government', district: 'maitama', cell: [2, -2], type: 'civic', height: 12, color: '#e8e0d0', accent: '#2e7d32', domain: 'finance.demo.gov.ng', staff: 1500, ceo: 'Hauwa Bello', posture: 47 },
  { id: 'min-digital', name: 'Ministry of Digital Economy (demo)', short: 'MoDE', sector: 'Government', district: 'cbd', cell: [5, 0], type: 'civic', height: 12, color: '#e3e6ee', accent: '#1565c0', domain: 'digital.demo.gov.ng', staff: 900, ceo: 'Emeka Nwosu', posture: 66 },
  { id: 'atlantic-trust', name: 'Atlantic Trust Bank', short: 'ATB', sector: 'Banking', district: 'maitama', cell: [-4, -3], type: 'twin', height: 36, color: '#3d6f8e', accent: '#f2b134', domain: 'atlantictrust.ng', staff: 4200, ceo: 'Babajide Adeyemi', posture: 62 },
  { id: 'maitama-capital', name: 'Maitama Capital Group', short: 'MCG', sector: 'Investment Banking', district: 'maitama', cell: [2, -3], type: 'stepped', height: 44, color: '#c86f4a', accent: '#2f4858', domain: 'maitamacapital.ng', staff: 1800, ceo: 'Ngozi Eze', posture: 71 },
  { id: 'zuma-mutual', name: 'Zuma Mutual Assurance', short: 'ZMA', sector: 'Insurance', district: 'maitama', cell: [4, -2], type: 'cylinder', height: 30, color: '#7a9e7e', accent: '#f4f1de', domain: 'zumamutual.ng', staff: 950, ceo: 'Tunde Bakare', posture: 55 },
  { id: 'naira-pay', name: 'NairaPay', short: 'NPAY', sector: 'Fintech', district: 'maitama', cell: [-2, -4], type: 'prism', height: 30, color: '#5b5f97', accent: '#ffc145', domain: 'nairapay.ng', staff: 600, ceo: 'Chiamaka Obi', posture: 68 },
  { id: 'savanna-tel', name: 'SavannaTel', short: 'STEL', sector: 'Telecoms', district: 'maitama', cell: [1, -4], type: 'spire', height: 48, color: '#2a9d8f', accent: '#e76f51', domain: 'savannatel.ng', staff: 5100, ceo: 'Ibrahim Musa', posture: 59 },
  { id: 'delta-energy', name: 'Delta Energy Plc', short: 'DEP', sector: 'Oil & Gas', district: 'maitama', cell: [4, -4], type: 'slab', height: 34, color: '#6d597a', accent: '#e9c46a', domain: 'deltaenergy.ng', staff: 3300, ceo: 'Folake Johnson', posture: 50 },
];

// Public landmarks: modelled and labelled, but not tenants, so no drills.
export const LANDMARKS = [
  { id: 'national-mosque', landmark: true, name: 'Abuja National Mosque', short: 'National Mosque', district: 'cbd', cell: [-4, -1], span: [2, 2], blurb: 'Golden-domed mosque with four minarets, on Independence Avenue in the Central Business District.' },
  { id: 'city-gate', landmark: true, name: 'Abuja City Gate', short: 'City Gate', position: [-14, -0.6, 100], blurb: '"You are welcome." This monumental gateway stands on the Airport Road at the entrance to the FCT.' },
];

export const PLACES = [...ORGS, ...LANDMARKS];

// Cells covered by a place (multi-block sites use `span: [cols, rows]`).
export function orgCells(o) {
  if (!o.cell) return [];
  const [sx, sy] = o.span || [1, 1];
  const cells = [];
  for (let di = 0; di < sx; di++) for (let dj = 0; dj < sy; dj++) cells.push([o.cell[0] + di, o.cell[1] + dj]);
  return cells;
}

// World-space centre of a place's footprint (x, z).
export function orgCenter(o) {
  if (o.position) return [o.position[0], o.position[2]];
  const [sx, sy] = o.span || [1, 1];
  return [(o.cell[0] + (sx - 1) / 2) * CELL, (o.cell[1] + (sy - 1) / 2) * CELL];
}
