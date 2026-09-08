/**
 * Original, articulated Canvas 2D explorer. No raster assets or image processing.
 * Logical canvas: 128 × 176; resting foot anchor: (64, 166).
 * Directions: 0 down, 1 left, 2 right, 3 up. Phase is radians.
 * Call on a cleared canvas; this function preserves the caller's transform/state.
 */
export type ExplorerDirection = 0 | 1 | 2 | 3;
type Point = { x: number; y: number };
type LegPose = {
  hip: Point;
  knee: Point;
  ankle: Point;
  sole: Point;
  lift: number;
};

const TAU = Math.PI * 2;
const palette = {
  outline: '#152124',
  seam: '#233336',
  jacketLight: '#789697',
  jacket: '#466b76',
  jacketDark: '#263e4a',
  shirt: '#cbc3a5',
  shirtLight: '#e3d9ba',
  trouserLight: '#545652',
  trouser: '#333d40',
  trouserDark: '#202b31',
  leatherLight: '#a37542',
  leather: '#725034',
  leatherDark: '#3b2c25',
  skinLight: '#e5bd87',
  skin: '#c99567',
  skinDark: '#976747',
  hairLight: '#926642',
  hair: '#5b3f2e',
  hairDark: '#302721',
  brass: '#b49a5b',
};

/** Positive forward displacement and swing lift are separate gait signals. */
function gait(phase: number, moving: boolean) {
  return {
    reach: moving
      ? phase % TAU < Math.PI
        ? 1 - (2 * (phase % TAU)) / Math.PI
        : -Math.cos(phase - Math.PI)
      : 0,
    lift: moving ? 17 * Math.max(0, -Math.sin(phase)) : 0,
  };
}

/** Two-segment leg IK. The knee always bends toward the facing direction. */
function kneeIK(hip: Point, ankle: Point, facing: number): Point {
  const dx = ankle.x - hip.x,
    dy = ankle.y - hip.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const d = Math.min(69.5, distance);
  const offset = Math.sqrt(Math.max(0, 35 * 35 - (d * d) / 4));
  return {
    x: hip.x + dx * 0.5 + ((facing * dy) / distance) * offset,
    y: hip.y + dy * 0.5 - ((facing * dx) / distance) * offset,
  };
}

export function drawExplorer(
  ctx: CanvasRenderingContext2D,
  direction: ExplorerDirection,
  phase: number,
  moving: boolean,
): void {
  ctx.save();
  ctx.lineJoin = 'bevel';
  ctx.lineCap = 'round';
  const profile = direction === 1 || direction === 2;
  const facing = direction === 1 ? -1 : 1;
  const back = direction === 3;
  const p = Number.isFinite(phase) ? ((phase % TAU) + TAU) % TAU : 0;
  const bob = moving ? -Math.abs(Math.sin(p)) * 2.3 : 0;
  const lean = moving && profile ? facing * 1.3 : 0;

  function path(points: number[][]) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }
  function line(points: number[][], color: string, width = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function polygon(
    points: number[][],
    color: string,
    edge = palette.outline,
    width = 1.4,
  ) {
    path(points);
    ctx.fillStyle = color;
    ctx.fill();
    if (width) {
      ctx.strokeStyle = edge;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  function shaded(
    points: number[][],
    light: string,
    mid: string,
    dark: string,
    grain = 0,
  ) {
    const xs = points.map((a) => a[0]),
      ys = points.map((a) => a[1]);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, light);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(1, dark);
    path(points);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = 1.25;
    ctx.stroke();
    if (grain) {
      ctx.save();
      path(points);
      ctx.clip();
      for (let y = Math.floor(y0) + 2; y < y1; y += 3) {
        for (let x = Math.floor(x0) + 1; x < x1; x += 3) {
          const seed = ((x * 31 + y * 17) ^ (x * y * 3)) >>> 0;
          if (seed % 5 === 0) {
            ctx.fillStyle =
              seed % 2 ? 'rgba(235,221,171,.11)' : 'rgba(8,19,22,.13)';
            ctx.fillRect(x, y, 1 + (seed % 2), 1);
          }
        }
      }
      ctx.restore();
    }
  }
  function limb(
    a: Point,
    b: Point,
    wa: number,
    wb: number,
    colors: string[],
    grain = 1,
  ) {
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const nx = (b.y - a.y) / d,
      ny = -(b.x - a.x) / d;
    const points = [
      [a.x - (nx * wa) / 2, a.y - (ny * wa) / 2],
      [a.x + (nx * wa) / 2, a.y + (ny * wa) / 2],
      [b.x + (nx * wb) / 2, b.y + (ny * wb) / 2],
      [b.x - (nx * wb) / 2, b.y - (ny * wb) / 2],
    ];
    shaded(points, colors[0], colors[1], colors[2], grain);
  }
  function ellipse(
    x: number,
    y: number,
    rx: number,
    ry: number,
    fill: string,
    edge = palette.outline,
  ) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function legPose(index: number): LegPose {
    const signal = gait(p + index * Math.PI, moving);
    const side = index === 0 ? -1 : 1;
    const hip = { x: 64 + (profile ? side * 2 : side * 8) + lean, y: 97 + bob };
    let sole: Point;
    if (profile) {
      sole = {
        x: 64 + side * 2 + facing * 32 * signal.reach,
        y: 166 - signal.lift,
      };
    } else {
      const depth = moving ? 4 * (1 + (back ? 1 : -1) * signal.reach) : 0;
      sole = {
        x: 64 + side * 10 + side * Math.abs(signal.reach) * 1.5,
        y: 166 - depth - signal.lift,
      };
    }
    const ankle = { x: sole.x, y: sole.y - 8 };
    const knee =
      profile && moving
        ? kneeIK(hip, ankle, facing)
        : {
            x:
              hip.x +
              (ankle.x - hip.x) * 0.43 +
              side * (signal.lift > 0 ? 1.8 : -0.5),
            y: hip.y + (ankle.y - hip.y) * 0.51 - signal.lift * 0.16,
          };
    return { hip, knee, ankle, sole, lift: signal.lift };
  }
  const legs = [legPose(0), legPose(1)];
  function boot(leg: LegPose, far: boolean) {
    const { x, y } = leg.ankle;
    const dark = far ? '#342b26' : palette.leatherDark;
    if (profile) {
      const f = facing;
      shaded(
        [
          [x - f * 4, y - 4],
          [x + f * 4, y - 4],
          [x + f * 5, y + 2],
          [x + f * 12, y + 5],
          [x + f * 12, y + 8],
          [x - f * 5, y + 8],
          [x - f * 5, y + 3],
        ],
        far ? '#795c3c' : palette.leatherLight,
        palette.leather,
        dark,
        1,
      );
      line(
        [
          [x - f * 4, y + 7],
          [x + f * 11, y + 7],
        ],
        '#292a25',
        2,
      );
      line(
        [
          [x + f * 2, y],
          [x + f * 6, y + 3],
        ],
        '#c29b67',
        1,
      );
      for (let k = 0; k < 3; k++)
        line(
          [
            [x - f * 1, y - 2 + k * 2],
            [x + f * 4, y - 1 + k * 2],
          ],
          '#ae9465',
          0.85,
        );
    } else {
      shaded(
        [
          [x - 5, y - 5],
          [x + 5, y - 5],
          [x + 5, y + 2],
          [x + 6, y + 5],
          [x + 5, y + 8],
          [x - 6, y + 8],
          [x - 6, y + 4],
        ],
        far ? '#806040' : palette.leatherLight,
        palette.leather,
        dark,
        1,
      );
      line(
        [
          [x - 5, y + 7],
          [x + 5, y + 7],
        ],
        '#272a26',
        2,
      );
      if (!back)
        for (let k = 0; k < 3; k++)
          line(
            [
              [x - 3, y - 2 + k * 2],
              [x + 3, y - 2 + k * 2],
            ],
            '#bd9b64',
            1,
          );
      else
        line(
          [
            [x - 3, y - 1],
            [x + 3, y - 1],
          ],
          '#9b7950',
          1,
        );
    }
  }
  function leg(index: number, far: boolean) {
    const l = legs[index];
    const c = far
      ? ['#3d4544', '#2c3538', '#17252d']
      : [palette.trouserLight, palette.trouser, palette.trouserDark];
    limb(l.hip, l.knee, 13, 11, c);
    ellipse(l.knee.x, l.knee.y, 5.3, 4.5, c[1]);
    limb(l.knee, l.ankle, 10.8, 7.8, c);
    // Front-facing fabric seams continue across the articulated segments.
    line(
      [
        [l.hip.x - 2, l.hip.y + 5],
        [l.knee.x - 2, l.knee.y - 3],
      ],
      far ? '#46504b' : '#777668',
      0.9,
    );
    line(
      [
        [l.knee.x - 3, l.knee.y + 5],
        [l.ankle.x - 2, l.ankle.y - 5],
      ],
      '#4b5652',
      1,
    );
    line(
      [
        [l.knee.x - 4, l.knee.y - 2],
        [l.knee.x + 2, l.knee.y],
      ],
      '#19292f',
      1.2,
    );
    line(
      [
        [l.ankle.x - 3, l.ankle.y - 4],
        [l.ankle.x + 3, l.ankle.y - 3],
      ],
      '#7a7866',
      1.1,
    );
    boot(l, far);
  }

  function arm(index: number, far: boolean) {
    const side = index === 0 ? -1 : 1;
    const swing = moving ? -Math.cos(p + index * Math.PI) : 0;
    const shoulder = {
      x: 64 + (profile ? side * 4 : side * 18) + lean,
      y: 55 + bob,
    };
    const hand = {
      x:
        64 +
        (profile
          ? side * 3 + facing * swing * 15
          : side * (23 + Math.abs(swing) * 1.5)) +
        lean,
      y: 94 + bob - (profile ? Math.abs(swing) * 4 : swing * 4),
    };
    const elbow = {
      x:
        shoulder.x +
        (hand.x - shoulder.x) * 0.55 +
        (profile ? facing * 1.5 : side * 2),
      y: 76 + bob - Math.abs(swing) * 3,
    };
    const c = far
      ? ['#45616a', '#334d58', '#263843']
      : [palette.jacketLight, palette.jacket, palette.jacketDark];
    limb(shoulder, elbow, 12, 9, c);
    const cuff = {
      x: elbow.x + (hand.x - elbow.x) * 0.66,
      y: elbow.y + (hand.y - elbow.y) * 0.66,
    };
    limb(elbow, cuff, 9.5, 8, c);
    limb(
      { x: cuff.x, y: cuff.y - 1 },
      {
        x: cuff.x + (hand.x - cuff.x) * 0.3,
        y: cuff.y + (hand.y - cuff.y) * 0.3,
      },
      9,
      8,
      [palette.shirtLight, palette.shirt, '#827e68'],
      0,
    );
    limb(
      cuff,
      hand,
      6.5,
      5.8,
      [palette.skinLight, palette.skin, palette.skinDark],
      0,
    );
    ellipse(hand.x, hand.y + 1, 4.0, 5.0, far ? '#af815a' : palette.skin);
    line(
      [
        [hand.x - 2, hand.y],
        [hand.x - 1, hand.y + 3],
      ],
      '#edc08a',
      1.1,
    );
    line(
      [
        [elbow.x - 3, elbow.y - 2],
        [elbow.x + 3, elbow.y],
      ],
      '#304e59',
      1,
    );
  }

  // A fixed near/far anatomical ordering prevents a leg swapping its identity.
  const farIndex = profile ? (direction === 1 ? 1 : 0) : back ? 0 : 1;
  const nearIndex = 1 - farIndex;
  leg(farIndex, true);
  arm(farIndex, true);
  leg(nearIndex, false);

  ctx.save();
  ctx.translate(lean, bob);
  if (profile) {
    const f = facing;
    const xx = (offset: number) => 64 + f * offset;
    shaded(
      [
        [xx(-10), 52],
        [xx(5), 49],
        [xx(13), 58],
        [xx(11), 87],
        [xx(8), 99],
        [xx(-12), 98],
        [xx(-14), 78],
      ],
      palette.jacketLight,
      palette.jacket,
      palette.jacketDark,
      1,
    );
    // Shirt wedge and jacket lapel face toward the walking direction.
    shaded(
      [
        [xx(5), 51],
        [xx(11), 57],
        [xx(10), 87],
        [xx(4), 86],
        [xx(3), 62],
      ],
      palette.shirtLight,
      palette.shirt,
      '#8a8a75',
      1,
    );
    polygon(
      [
        [xx(2), 51],
        [xx(6), 49],
        [xx(8), 58],
        [xx(4), 65],
        [xx(0), 56],
      ],
      '#63818a',
    );
    line(
      [
        [xx(-9), 58],
        [xx(-10), 81],
        [xx(-7), 91],
      ],
      '#80999a',
      1,
    );
    line(
      [
        [xx(-7), 89],
        [xx(3), 86],
      ],
      '#2d4651',
      1.3,
    );
    // Waist seam and tool pouch.
    polygon(
      [
        [xx(-12), 96],
        [xx(9), 96],
        [xx(8), 102],
        [xx(-12), 102],
      ],
      '#403a30',
    );
    shaded(
      [
        [xx(-13), 87],
        [xx(-3), 88],
        [xx(-3), 101],
        [xx(-13), 100],
      ],
      palette.leatherLight,
      palette.leather,
      palette.leatherDark,
      1,
    );
    line(
      [
        [xx(-12), 91],
        [xx(-4), 92],
      ],
      '#bf9660',
      1,
    );
    ctx.fillStyle = palette.brass;
    ctx.fillRect(xx(-8) - 1, 92, 2, 2);
  } else {
    shaded(
      [
        [47, 51],
        [56, 48],
        [72, 48],
        [81, 52],
        [83, 71],
        [79, 97],
        [49, 97],
        [45, 71],
      ],
      palette.jacketLight,
      palette.jacket,
      palette.jacketDark,
      1,
    );
    if (!back) {
      shaded(
        [
          [57, 50],
          [70, 50],
          [74, 91],
          [54, 91],
        ],
        palette.shirtLight,
        palette.shirt,
        '#8b8f7b',
        1,
      );
      polygon(
        [
          [56, 49],
          [61, 53],
          [56, 65],
          [51, 56],
        ],
        '#849c9c',
      );
      polygon(
        [
          [70, 49],
          [66, 53],
          [73, 65],
          [77, 56],
        ],
        '#557b85',
      );
      line(
        [
          [62, 58],
          [62, 80],
        ],
        '#a49d82',
        1,
      );
      ctx.fillStyle = '#6a725f';
      [62, 70, 80].forEach((y) => ctx.fillRect(64, y, 1.4, 1.4));
      polygon(
        [
          [49, 74],
          [55, 75],
          [54, 83],
          [49, 82],
        ],
        '#3f6069',
      );
      polygon(
        [
          [74, 74],
          [79, 73],
          [78, 82],
          [73, 83],
        ],
        '#35525e',
      );
      line(
        [
          [49, 76],
          [54, 77],
        ],
        '#8da09a',
        0.8,
      );
      line(
        [
          [74, 76],
          [78, 75],
        ],
        '#758d8c',
        0.8,
      );
      line(
        [
          [50, 88],
          [55, 85],
        ],
        '#294a57',
        1.2,
      );
      line(
        [
          [75, 88],
          [79, 87],
        ],
        '#203b49',
        1.2,
      );
    } else {
      // Tailored back yoke, reinforced spine seam and worn shoulder edges.
      polygon(
        [
          [49, 54],
          [59, 50],
          [70, 50],
          [80, 54],
          [77, 65],
          [51, 65],
        ],
        '#527783',
      );
      line(
        [
          [52, 64],
          [76, 64],
        ],
        '#93a49a',
        1,
      );
      line(
        [
          [64, 67],
          [64, 91],
        ],
        '#314e59',
        1.5,
      );
      line(
        [
          [51, 80],
          [56, 87],
          [54, 91],
        ],
        '#294855',
        1.5,
      );
      line(
        [
          [76, 80],
          [72, 89],
        ],
        '#385966',
        1.5,
      );
    }
    polygon(
      [
        [49, 94],
        [79, 94],
        [79, 101],
        [49, 101],
      ],
      '#494238',
    );
    line(
      [
        [50, 94],
        [78, 94],
      ],
      '#8a7f5e',
      1,
    );
    if (!back)
      polygon(
        [
          [60, 94],
          [68, 94],
          [68, 100],
          [60, 100],
        ],
        palette.brass,
      );
    ctx.fillStyle = '#493b2a';
    if (!back) ctx.fillRect(62, 96, 4, 2);
    shaded(
      [
        [77, 89],
        [86, 88],
        [88, 103],
        [77, 105],
      ],
      palette.leatherLight,
      palette.leather,
      palette.leatherDark,
      1,
    );
    line(
      [
        [78, 93],
        [85, 92],
      ],
      '#c29b65',
      1,
    );
    ctx.fillStyle = palette.brass;
    ctx.fillRect(82, 94, 2, 2);
  }
  // Neck is visible under the collar in every orientation.
  shaded(
    [
      [59, 43],
      [69, 43],
      [70, 52],
      [64, 55],
      [58, 51],
    ],
    palette.skinLight,
    palette.skin,
    palette.skinDark,
    0,
  );

  if (profile) {
    const f = facing,
      xx = (offset: number) => 64 + f * offset;
    shaded(
      [
        [xx(-9), 23],
        [xx(5), 22],
        [xx(11), 28],
        [xx(11), 33],
        [xx(15), 35],
        [xx(11), 38],
        [xx(10), 44],
        [xx(5), 49],
        [xx(-6), 46],
        [xx(-10), 36],
      ],
      palette.skinLight,
      palette.skin,
      palette.skinDark,
      0,
    );
    ellipse(xx(-1), 36, 3.5, 4.7, palette.skin);
    line(
      [
        [xx(-2), 35],
        [xx(0), 34],
        [xx(1), 38],
      ],
      palette.skinDark,
      0.9,
    );
    polygon(
      [
        [xx(-13), 31],
        [xx(-15), 25],
        [xx(-12), 20],
        [xx(-13), 17],
        [xx(-7), 18],
        [xx(-3), 14],
        [xx(1), 16],
        [xx(5), 14],
        [xx(9), 18],
        [xx(13), 21],
        [xx(11), 27],
        [xx(5), 30],
        [xx(3), 34],
        [xx(0), 29],
        [xx(-4), 34],
        [xx(-5), 42],
        [xx(-11), 39],
      ],
      palette.hair,
      palette.hairDark,
      1.5,
    );
    line(
      [
        [xx(-9), 23],
        [xx(-4), 20],
        [xx(1), 21],
        [xx(6), 19],
      ],
      palette.hairLight,
      1.5,
    );
    line(
      [
        [xx(-9), 29],
        [xx(-6), 25],
        [xx(-2), 24],
      ],
      '#a4774d',
      1,
    );
    line(
      [
        [xx(-12), 34],
        [xx(-9), 30],
      ],
      '#3a2e26',
      1.5,
    );
    line(
      [
        [xx(7), 31],
        [xx(10), 31],
      ],
      '#3a2c26',
      1.5,
    );
    ctx.fillStyle = '#1b2727';
    ctx.fillRect(xx(9) - 0.7, 33, 1.7, 2.5);
    ctx.fillStyle = '#e6d0a2';
    ctx.fillRect(xx(10) - 0.3, 33, 0.8, 0.8);
    line(
      [
        [xx(8), 42],
        [xx(11), 41],
      ],
      '#895f46',
      0.8,
    );
  } else {
    if (!back) {
      ellipse(51, 35, 3, 5, palette.skin);
      ellipse(77, 35, 3, 5, palette.skinDark);
      shaded(
        [
          [53, 25],
          [64, 22],
          [75, 26],
          [77, 36],
          [73, 45],
          [66, 49],
          [57, 46],
          [51, 37],
        ],
        palette.skinLight,
        palette.skin,
        palette.skinDark,
        0,
      );
      line(
        [
          [56, 34],
          [60, 33],
        ],
        '#4d3428',
        1.4,
      );
      line(
        [
          [68, 33],
          [73, 34],
        ],
        '#4d3428',
        1.4,
      );
      ctx.fillStyle = '#253132';
      ctx.fillRect(57, 35, 2.4, 3);
      ctx.fillRect(69, 35, 2.4, 3);
      ctx.fillStyle = '#dfd6b3';
      ctx.fillRect(57, 35, 0.9, 0.9);
      ctx.fillRect(69, 35, 0.9, 0.9);
      line(
        [
          [64, 36],
          [63, 40],
          [65, 40],
        ],
        '#ac7e55',
        0.9,
      );
      line(
        [
          [61, 44],
          [66, 44],
        ],
        '#875c43',
        0.9,
      );
      line(
        [
          [55, 40],
          [57, 41],
        ],
        '#dca273',
        1,
      );
      polygon(
        [
          [49, 33],
          [47, 27],
          [49, 23],
          [47, 20],
          [53, 20],
          [55, 16],
          [61, 18],
          [65, 14],
          [69, 17],
          [73, 16],
          [78, 21],
          [80, 26],
          [78, 34],
          [74, 39],
          [72, 30],
          [69, 33],
          [65, 27],
          [60, 32],
          [57, 28],
          [52, 36],
        ],
        palette.hair,
        palette.hairDark,
        1.5,
      );
      line(
        [
          [51, 25],
          [56, 21],
          [62, 22],
          [66, 19],
        ],
        palette.hairLight,
        1.5,
      );
      line(
        [
          [66, 23],
          [71, 21],
          [76, 25],
        ],
        '#a4774d',
        1.1,
      );
      line(
        [
          [50, 29],
          [53, 26],
          [55, 25],
        ],
        '#aa7950',
        1,
      );
      line(
        [
          [60, 24],
          [57, 28],
        ],
        '#342923',
        1.5,
      );
      line(
        [
          [71, 28],
          [74, 31],
        ],
        '#392c25',
        1.4,
      );
    } else {
      polygon(
        [
          [49, 33],
          [47, 27],
          [49, 22],
          [47, 20],
          [53, 20],
          [56, 16],
          [61, 17],
          [66, 14],
          [71, 18],
          [76, 18],
          [79, 23],
          [80, 29],
          [77, 39],
          [73, 45],
          [68, 48],
          [65, 46],
          [61, 49],
          [55, 44],
          [51, 41],
        ],
        palette.hair,
        palette.hairDark,
        1.5,
      );
      line(
        [
          [51, 25],
          [57, 21],
          [63, 22],
          [67, 19],
          [73, 23],
        ],
        palette.hairLight,
        1.5,
      );
      line(
        [
          [51, 31],
          [56, 27],
          [62, 28],
          [65, 24],
        ],
        '#956d49',
        1.1,
      );
      line(
        [
          [57, 33],
          [61, 36],
          [65, 31],
          [70, 34],
          [75, 29],
        ],
        '#785339',
        1,
      );
      line(
        [
          [54, 38],
          [59, 41],
          [62, 39],
        ],
        '#352a24',
        1.7,
      );
      line(
        [
          [65, 42],
          [70, 44],
          [74, 39],
        ],
        '#322821',
        1.4,
      );
    }
  }
  ctx.restore();
  // Near sleeve overlays torso; the far sleeve stays behind it.
  arm(nearIndex, false);
  ctx.restore();
}
