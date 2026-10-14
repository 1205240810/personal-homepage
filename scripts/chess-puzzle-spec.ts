/**
 * 新增残局题的“原始描述”：局面（FEN 或从开局走出的着法）、预期首着与中文解析。
 * scripts/gen-chess-puzzles.ts 用引擎/穷举把它们算成 lib/games/chess-puzzle-data.ts
 * （关键着法、主线、每个看似合理的错着的反击与说明）；测试会重新验证生成结果。
 */
export type PuzzleSpec = {
  id: string;
  name: string;
  /** Either a FEN or a move list from the initial position. */
  fen?: string;
  moves?: string;
  kind: 'mate' | 'win';
  /** Mate in n (mate) — or, for `win`, the minimum gain in centipawns. */
  n: number;
  key: string;
  note: string;
  explain: string;
};

export const SPECS: PuzzleSpec[] = [
  {
    id: 'anastasia',
    name: '安娜斯塔西亚杀',
    fen: '5r2/4Nppk/8/8/8/8/8/K5R1 w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Rh1#',
    note: '马已经封住了 g8 和 g6。',
    explain:
      'e7 的马控制 g8、g6，黑王被自己的 g7 兵挡住，车沿着打开的 h 线将军就无路可逃。这就是“安娜斯塔西亚杀”：马封边、车将杀。',
  },
  {
    id: 'boden',
    name: '博登杀',
    fen: '2kr4/p2n4/8/8/5B2/8/4B3/6K1 w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Ba6#',
    note: '两只象交叉火力。',
    explain:
      'f4 的象控制 b8 和 c7，a6 的象一将，黑王的 b7、b8、c7 全被象封住，d7、d8 又是自己的子。两象交叉的这种杀法叫“博登杀”，常出现在后翼长易位之后。',
  },
  {
    id: 'damiano',
    name: '达米亚诺杀',
    fen: '5rk1/5p2/6P1/8/8/8/8/6KQ w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Qh7#',
    note: 'g6 兵是后的靠山。',
    explain:
      '后冲到 h7，有 g6 兵保护，黑王不能吃；f8 有自己的车、f7 有自己的兵，h8 和 g7 又被后控制。一个兵加一个后就能完成的经典杀法。',
  },
  {
    id: 'epaulette',
    name: '肩章杀',
    fen: '3rkr2/8/8/8/8/8/Q7/4K3 w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Qe6#',
    note: '黑王两边都是自己的车。',
    explain:
      'Qe6 将军，同时控制 d7、e7、f7；黑王左右两边是自己的车，像两只“肩章”把自己堵死了。注意 Qa4+ 也是将军，但黑方能用车垫在 d7。',
  },
  {
    id: 'greco',
    name: '格雷科杀',
    fen: '5r1k/6p1/8/8/2B5/8/8/3Q2K1 w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Qh5#',
    note: '象在远处控制着 g8。',
    explain:
      'c4 的象沿斜线控制 g8，后到 h 线将军，h7 也在后的控制下；g7 是自己的兵，黑王无处可去。象从远处“锁门”，是格雷科杀的标志。',
  },
  {
    id: 'lolli',
    name: '洛利杀',
    fen: '6k1/5p1p/5PpQ/8/8/8/8/6K1 w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Qg7#',
    note: 'f6 兵深入敌阵。',
    explain:
      '后到 g7 由 f6 兵保护，黑王不能吃；f8、h8 被后控制，其余格子都是自己的兵。插在 f6 的兵经常是王翼进攻的“楔子”。',
  },
  {
    id: 'morphy',
    name: '莫菲杀',
    fen: '7k/7p/8/8/8/8/8/K1B3R1 w - - 0 1',
    kind: 'mate',
    n: 1,
    key: 'Bb2#',
    note: '车已经封住了 g 线。',
    explain:
      'g1 的车控制整条 g 线，象走到长斜线 b2 将军，黑王的 g8、g7 都被车封住，h7 是自己的兵。车封线、象将军，正是莫菲杀。',
  },
  {
    id: 'fools',
    name: '傻瓜杀（黑先）',
    moves: 'f3 e5 g4',
    kind: 'mate',
    n: 1,
    key: 'Qh4#',
    note: '白方两步就打开了王的斜线。',
    explain:
      '白方走 f3、g4 把 e1–h4 斜线完全打开，黑后一步到 h4 将军，没有任何子能挡、王也无处可走。这是理论上最快的将杀。',
  },
  {
    id: 'caro-smother',
    name: '卡罗-康闷杀',
    moves: 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6',
    kind: 'mate',
    n: 1,
    key: 'Nd6#',
    note: '黑王身边全是自己的子。',
    explain:
      'e2 的后钉住了 e7 兵，马跳到 d6 将军，黑方无法用 exd6 吃马（兵被钉住，吃了会让王被后将）；王的四周又全被自己的子占着，于是成了闷杀。',
  },
  {
    id: 'budapest',
    name: '布达佩斯陷阱（黑先）',
    moves: 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4',
    kind: 'mate',
    n: 1,
    key: 'Nd3#',
    note: '白方贪吃了象。',
    explain:
      '白方 axb4 吃象，却让 d3 空了出来。Nd3 将军：e2 兵挡不住马，王的 d2 被自己的马占着，e2 被兵占着，f4 的象也帮不上忙——闷杀。',
  },
  {
    id: 'englund',
    name: '英格伦陷阱（黑先）',
    moves: 'd4 e5 dxe5 Nc6 Nf3 Qe7 Bf4 Qb4+ Bd2 Qxb2 Bc3 Bb4 Qd2 Bxc3 Qxc3',
    kind: 'mate',
    n: 1,
    key: 'Qc1#',
    note: '白后离开了 d1。',
    explain:
      '白后被引到 c3，底线没人守了。Qc1 将军，后由……没人能吃：d1 空着，王的 d2 被 c1 后控制，其余格子都被自己的子挡住。',
  },
  {
    id: 'blackburne',
    name: '布莱克本陷阱（黑先）',
    moves: 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1',
    kind: 'win',
    n: 500,
    key: 'Qxe4+',
    note: '白马贪吃了 f7 和车。',
    explain:
      'Qxe4+ 先吃兵将军。若白方 Be2 垫将，Nf3# 闷杀——马将军，王被自己的车和象堵死；若改用 Qe2 垫将，Nxe2 直接吃后，黑方多一个后。白马贪吃 f7 和车，代价是整个王翼。',
  },
  {
    id: 'philidor-legacy',
    name: '菲利道尔遗产（两步杀）',
    fen: 'r6k/6pp/4Q2N/8/8/8/8/6K1 w - - 0 1',
    kind: 'mate',
    n: 2,
    key: 'Qg8+',
    note: '弃后，然后闷杀。',
    explain:
      '弃后 Qg8+！黑王不能吃（h6 的马保护 g8），只能 Rxg8；这样黑王四周全被自己的子堵住，Nf7# 闷杀。用最贵的子换来最漂亮的杀法。',
  },

  {
    id: 'elephant',
    name: '大象陷阱（黑先）',
    moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5',
    kind: 'win',
    n: 200,
    key: 'Nxd5',
    note: 'd7 马好像被钉住了？',
    explain:
      '白方以为 f6 马被钉住，吃了 d5 兵。其实 Nxd5! 弃后：若 Bxd8，则 Bb4+ 先将军，白只能 Qd2 垫，Bxd2+ Kxd2 Kxd8，黑方多一个子。钉子只是“相对”的，背后有将军就能解开。',
  },
  {
    id: 'petrov',
    name: '彼得罗夫陷阱',
    moves: 'e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6',
    kind: 'win',
    n: 500,
    key: 'Nc6+',
    note: '黑王和后在同一条线上。',
    explain:
      'Nc6+ 是“闪击”：马离开 e5 的同时，e2 的后对黑王将军，而马自己正在攻击 d8 的后。黑方必须先应将，白方下一步吃后。',
  },

  {
    id: 'lasker',
    name: '拉斯克陷阱（黑先）',
    moves: 'd4 d5 c4 e5 dxe5 d4 e3 Bb4+ Bd2 dxe3 Bxb4',
    kind: 'win',
    n: 250,
    key: 'exf2+',
    note: '白方以为可以白吃象。',
    explain:
      'exf2+! Ke2 之后，fxg1=N+! 低升变为马将军——如果升后，白方 Qxd8+ 反过来吃后。Rxg1 后 Bg4+ 再赢白后，黑方大优。',
  },

  {
    id: 'double-back-rank',
    name: '底线双重攻击（两步杀）',
    fen: 'r5k1/5ppp/8/1Q6/8/8/5PPP/4R1K1 w - - 0 1',
    kind: 'mate',
    n: 2,
    key: 'Re8+',
    note: '黑车一个人守着底线。',
    explain:
      'e8 被白车和白后同时盯着，而黑方只有 a8 车在守。Re8+ Rxe8 之后，Qxe8# —— 守卫被换掉，底线再无人防守。先用后冲 Qe8+ 也一样可以（Rxe8 Rxe8#），两种顺序都是正解。',
  },
  {
    id: 'royal-fork',
    name: '马的捉双',
    fen: 'r3k3/7p/8/1N6/8/8/6PP/4K3 w - - 0 1',
    kind: 'win',
    n: 150,
    key: 'Nc7+',
    note: '黑王和黑车隔着一个马步。',
    explain:
      'Nc7+ 同时攻击 e8 的王和 a8 的车（“捉双”）。黑方必须先应将，白方下一步 Nxa8 吃车。之后马在角落里可能会被黑王围住，但即便最后丢马，也是用马换车，净赚一档子力。马的将军无法被垫，是最可靠的捉双手段。',
  },
  {
    id: 'skewer',
    name: '车的串击',
    fen: '8/8/8/q3k3/8/8/8/6KR w - - 0 1',
    kind: 'win',
    n: 500,
    key: 'Rh5+',
    note: '黑王和黑后在同一横线上。',
    explain:
      'Rh5+ 沿第 5 横线将军，黑王必须离开这条线，于是身后的 a5 后暴露出来，Rxa5 白吃一后。这叫“串击”：攻击前面的大子，吃掉后面的子。',
  },
];

/** 解析 for the original nine puzzles. */
export const OLD_EXPLAIN: Record<string, string> = {
  'back-rank':
    '黑王被自己 f7、g7、h7 三个兵堵在底线，车到 d8 将军，没有子能挡也没有格子能逃。这就是“底线杀”——王前的兵最好留一个“透气孔”。',
  scholar:
    'f7 只有黑王自己在守，c4 的象和 f3 的后同时瞄着它。Qxf7 将军且有象保护，黑王吃不掉也走不开。',
  smothered:
    '黑王被自己的 g8 车和 g7、h7 兵围住，只有马能越过这些子将军。Nf7 一将，无处可逃——“闷杀”。',
  arabian:
    'f6 的马同时保护 h7 并控制 g8，车到 h7 将军。黑王吃不掉车（有马保护），g8、g7 又都被控制。车马配合的最古老杀法之一。',
  'queen-king':
    '白王在 f6 保护 g7，后贴到 g7 将军；黑王的 g8、h7 也都被后控制，吃后又有王保护。单后杀王时，王要先上来帮忙。',
  ladder:
    '一车占住第 7 横线（Ra7 或 Rb7 都行），黑王被封在底线，另一车再到第 8 横线将军。两车交替推进，就是“楼梯杀”。',
  legal:
    'Bxf7+ 先把黑王赶到 e7，然后 Nd5# —— 黑方刚吃了白后，却发现两只马和象已经织好了网。这就是“列加尔杀”：弃后换杀。',
  opera:
    'Qb8+! 弃后把 d7 马引开，Nxb8 之后，d 线完全打开，Rd8# 将杀（g5 的象控制 e7）。莫菲在歌剧院包厢里只花了 17 步。',
  'queen-sac':
    'Qd8+! 弃后，守底线的 e7 象被迫 Bxd8，于是 e 线打开，Re8# 将杀。“引离”守卫，是底线杀最常见的手段。',
};
