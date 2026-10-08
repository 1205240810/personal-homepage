import type Phaser from 'phaser';

// A physical cabinet in the room's perspective. Drawing at 3x keeps the metal,
// small fasteners and CRT legible when the camera covers a large viewport.
export function makeArcadeTexture(scene: Phaser.Scene) {
  const key = 'workshop-arcade-cabinet';
  if (scene.textures.exists(key)) return key;
  const scale = 3;
  const texture = scene.textures.createCanvas(key, 148 * scale, 216 * scale)!;
  const ctx = texture.context;
  ctx.scale(scale, scale);
  const path = (points: number[][]) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const panel = (points: number[][], from: string, to: string) => {
    path(points);
    const metal = ctx.createLinearGradient(20, 25, 114, 203);
    metal.addColorStop(0, from);
    metal.addColorStop(1, to);
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = '#101d20';
    ctx.lineWidth = 1.1;
    ctx.stroke();
  };
  const rivet = (x: number, y: number) => {
    ctx.fillStyle = '#0d171a';
    ctx.beginPath();
    ctx.ellipse(x, y, 2, 1.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9b927b';
    ctx.beginPath();
    ctx.ellipse(x - 0.25, y - 0.35, 1, 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  ctx.save();
  ctx.translate(80, 207);
  ctx.scale(1, 0.22);
  const shadow = ctx.createRadialGradient(0, 0, 4, 0, 0, 64);
  shadow.addColorStop(0, '#050d12c9');
  shadow.addColorStop(0.65, '#07101670');
  shadow.addColorStop(1, '#07101600');
  ctx.fillStyle = shadow;
  ctx.fillRect(-64, -64, 128, 128);
  ctx.restore();

  // Raised feet, three distinct faces and a thin brass edge follow the nearby
  // workshop consoles rather than making a flat sticker over the background.
  panel(
    [
      [25, 192],
      [102, 200],
      [100, 211],
      [25, 204],
    ],
    '#202c2e',
    '#111b1e',
  );
  panel(
    [
      [102, 200],
      [122, 194],
      [121, 206],
      [100, 211],
    ],
    '#1a2528',
    '#0c171a',
  );
  panel(
    [
      [101, 27],
      [127, 40],
      [123, 139],
      [122, 194],
      [101, 200],
      [107, 138],
      [92, 112],
      [97, 58],
    ],
    '#3b4748',
    '#202b2d',
  );
  panel(
    [
      [24, 15],
      [48, 6],
      [127, 40],
      [101, 27],
    ],
    '#9c967f',
    '#575a4d',
  );
  const face = [
    [24, 15],
    [101, 27],
    [97, 58],
    [92, 112],
    [107, 138],
    [101, 200],
    [25, 192],
    [21, 139],
    [30, 113],
    [28, 60],
  ];
  panel(face, '#6f7464', '#394546');

  ctx.save();
  path(face);
  ctx.clip();
  // Fine wear is deterministic, so the rendered texture has no random shimmer.
  for (let i = 0; i < 220; i++) {
    const x = 22 + ((i * 73) % 85);
    const y = 17 + ((i * 37) % 182);
    ctx.fillStyle = i % 3 ? '#0b171926' : '#cbc2a826';
    ctx.fillRect(x, y, i % 7 === 0 ? 3 : 0.7, 0.6);
  }
  ctx.restore();

  panel(
    [
      [28, 23],
      [96, 34],
      [92, 54],
      [29, 44],
    ],
    '#af9f73',
    '#695f48',
  );
  panel(
    [
      [34, 29],
      [90, 37],
      [88, 47],
      [35, 40],
    ],
    '#11282b',
    '#07151b',
  );
  ctx.save();
  ctx.translate(45, 38);
  ctx.transform(1, 0.13, 0, 1, 0, 0);
  ctx.font = '600 7px monospace';
  ctx.fillStyle = '#c6d6c1';
  ctx.fillText('AFTER HOURS', 0, 0);
  ctx.restore();

  // Recessed glass, reflected edge, phosphor trail and scan lines make this an
  // unmistakable arcade object without a sign floating outside the scene.
  panel(
    [
      [33, 54],
      [91, 63],
      [85, 111],
      [32, 101],
    ],
    '#15282b',
    '#071217',
  );
  panel(
    [
      [39, 62],
      [83, 69],
      [79, 101],
      [38, 94],
    ],
    '#1e6667',
    '#112c31',
  );
  ctx.save();
  path([
    [39, 62],
    [83, 69],
    [79, 101],
    [38, 94],
  ]);
  ctx.clip();
  const glow = ctx.createRadialGradient(61, 80, 3, 61, 80, 33);
  glow.addColorStop(0, '#75d2be66');
  glow.addColorStop(1, '#07161b00');
  ctx.fillStyle = glow;
  ctx.fillRect(34, 57, 56, 52);
  ctx.strokeStyle = '#7ad4bc';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(43, 82);
  ctx.lineTo(51, 83);
  ctx.lineTo(55, 76);
  ctx.lineTo(62, 77);
  ctx.lineTo(62, 91);
  ctx.lineTo(72, 92);
  ctx.lineTo(76, 84);
  ctx.stroke();
  for (let y = 64; y < 102; y += 2.4) {
    ctx.strokeStyle = '#07171b30';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(34, y);
    ctx.lineTo(91, y + 8);
    ctx.stroke();
  }
  ctx.fillStyle = '#d3eee512';
  path([
    [39, 62],
    [61, 65],
    [41, 94],
    [38, 94],
  ]);
  ctx.fill();
  ctx.restore();

  panel(
    [
      [30, 113],
      [92, 112],
      [107, 138],
      [22, 132],
    ],
    '#8d8c72',
    '#3f514d',
  );
  panel(
    [
      [22, 132],
      [107, 138],
      [106, 146],
      [23, 140],
    ],
    '#50615a',
    '#283a39',
  );
  ctx.fillStyle = '#13272b';
  ctx.beginPath();
  ctx.ellipse(47, 123, 7, 3.2, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#aeac8c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(46, 122);
  ctx.lineTo(43, 111);
  ctx.stroke();
  ctx.fillStyle = '#caab68';
  ctx.beginPath();
  ctx.arc(43, 110, 3.2, 0, Math.PI * 2);
  ctx.fill();
  for (const [x, y, color] of [
    [72, 125, '#b59d69'],
    [83, 127, '#6daba0'],
    [90, 122, '#a87760'],
  ] as const) {
    ctx.fillStyle = '#15282b';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 3.8, 2.4, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, 2.9, 1.7, 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  panel(
    [
      [33, 151],
      [91, 156],
      [89, 187],
      [34, 182],
    ],
    '#27383a',
    '#1b292d',
  );
  panel(
    [
      [62, 160],
      [79, 162],
      [79, 174],
      [62, 172],
    ],
    '#6b6955',
    '#333f3b',
  );
  ctx.fillStyle = '#0a171b';
  ctx.fillRect(65, 165, 11, 1.6);
  ctx.fillStyle = '#8fb59c';
  ctx.fillRect(65, 169, 3, 1.3);
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = '#0e2026';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(109, 157 + i * 5);
    ctx.lineTo(119, 153 + i * 5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#d5c99b85';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(25, 16);
  ctx.lineTo(100, 28);
  ctx.moveTo(25, 192);
  ctx.lineTo(101, 200);
  ctx.moveTo(101, 28);
  ctx.lineTo(97, 59);
  ctx.stroke();
  for (const [x, y] of [
    [31, 20],
    [94, 31],
    [34, 50],
    [90, 58],
    [31, 148],
    [95, 153],
    [33, 186],
    [94, 195],
    [120, 45],
    [115, 188],
  ])
    rivet(x, y);
  texture.refresh();
  return key;
}
