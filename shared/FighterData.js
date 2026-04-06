// Per-character base stats from the design doc, plus shared color palettes.
// Frame data for individual moves lives inside each fighter file.

export const FIGHTER_STATS = {
  gojo: {
    name: 'Gojo Satoru',
    weight: 95, walkSpeed: 1.1, runSpeed: 1.8, jumpHeight: 15,
    airSpeed: 1.0, fallSpeed: 1.5, ceMax: 100, ceRegen: 0.15,
    palette: { skin: '#f7d8b6', hair: '#ffffff', primary: '#1a2860', secondary: '#3a5cb0', accent: '#5fd7ff' },
  },
  yuji: {
    name: 'Yuji Itadori',
    weight: 88, walkSpeed: 1.3, runSpeed: 2.2, jumpHeight: 16,
    airSpeed: 1.2, fallSpeed: 1.6, ceMax: 100, ceRegen: 0.18,
    palette: { skin: '#f5cfa3', hair: '#ff8da1', primary: '#1c2440', secondary: '#3b4880', accent: '#ffb84a' },
  },
  sukuna: {
    name: 'Ryomen Sukuna',
    weight: 100, walkSpeed: 1.0, runSpeed: 1.7, jumpHeight: 14,
    airSpeed: 0.95, fallSpeed: 1.7, ceMax: 120, ceRegen: 0.12,
    palette: { skin: '#e8c4a0', hair: '#ff8da1', primary: '#2a0a18', secondary: '#5a0e22', accent: '#c01030' },
  },
  mahito: {
    name: 'Mahito',
    weight: 85, walkSpeed: 1.15, runSpeed: 1.9, jumpHeight: 15,
    airSpeed: 1.1, fallSpeed: 1.4, ceMax: 110, ceRegen: 0.16,
    palette: { skin: '#d8c8d0', hair: '#5a708a', primary: '#3c3848', secondary: '#6a627a', accent: '#9aff7a' },
  },
  todo: {
    name: 'Aoi Todo',
    weight: 115, walkSpeed: 0.9, runSpeed: 1.5, jumpHeight: 13,
    airSpeed: 0.85, fallSpeed: 1.9, ceMax: 80, ceRegen: 0.20,
    palette: { skin: '#d8a878', hair: '#3a2418', primary: '#2a3848', secondary: '#4a5868', accent: '#ffe070' },
  },
};

export const ROSTER = ['gojo', 'yuji', 'mahito', 'todo'];
