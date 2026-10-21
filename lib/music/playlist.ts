// 背景音乐播放列表：增删曲目只需编辑这个文件，并把音频放进 public/audio/。
// 只能放授权允许网站使用的曲目（CC0 / CC BY / 公有领域等），不要放商业版权歌曲。
// CC BY 曲目必须保留 license 与 source 字段，播放器会据此显示署名。
export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  /** 一句话描述，显示在播放列表里 */
  mood: string;
  /** 秒，仅用于加载前显示 */
  duration: number;
  src: string;
  license: { name: string; url: string };
  /** 作者原曲与授权页 */
  source: string;
  /** 本站对录音所作改动，用于署名说明 */
  changes: string;
};

const CC_BY_4 = {
  name: 'CC BY 4.0',
  url: 'https://creativecommons.org/licenses/by/4.0/',
};
const incompetech = (isrc: string) =>
  `https://incompetech.com/music/royalty-free/index.html?isrc=${isrc}`;

export const PLAYLIST: MusicTrack[] = [
  {
    id: 'morning',
    title: 'Morning',
    artist: 'Kevin MacLeod',
    mood: '晨光里的古典吉他与竖琴',
    duration: 153,
    src: '/audio/morning.mp3',
    changes: '原曲未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN2300003'),
  },
  {
    id: 'evening',
    title: 'Evening',
    artist: 'Kevin MacLeod',
    mood: '吉他、大提琴与双簧管，傍晚的余温',
    duration: 186,
    src: '/audio/evening.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN2300002'),
  },
  {
    id: 'dreamer',
    title: 'Dreamer',
    artist: 'Kevin MacLeod',
    mood: '轻柔钢琴，适合发呆',
    duration: 204,
    src: '/audio/dreamer.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1600043'),
  },
  {
    id: 'fresh-air',
    title: 'Fresh Air',
    artist: 'Kevin MacLeod',
    mood: '独奏钢琴，干净透亮',
    duration: 294,
    src: '/audio/fresh-air.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1500084'),
  },
  {
    id: 'reawakening',
    title: 'Reawakening',
    artist: 'Kevin MacLeod',
    mood: '钢琴与大提琴，慢慢醒来',
    duration: 214,
    src: '/audio/reawakening.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1400017'),
  },
  {
    id: 'clear-air',
    title: 'Clear Air',
    artist: 'Kevin MacLeod',
    mood: '吉他与钢琴，晴朗午后',
    duration: 184,
    src: '/audio/clear-air.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1100626'),
  },
  {
    id: 'last-kiss-goodnight',
    title: 'Last Kiss Goodnight',
    artist: 'Kevin MacLeod',
    mood: '吉他与弦乐，晚安前的温柔',
    duration: 186,
    src: '/audio/last-kiss-goodnight.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1100611'),
  },
  {
    id: 'windswept',
    title: 'Windswept',
    artist: 'Kevin MacLeod',
    mood: '吉他与弦乐，风吹过旷野',
    duration: 208,
    src: '/audio/windswept.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1100757'),
  },
  {
    id: 'danse-morialta',
    title: 'Danse Morialta',
    artist: 'Kevin MacLeod',
    mood: '独奏钢琴，带一点怀旧',
    duration: 236,
    src: '/audio/danse-morialta.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1200026'),
  },
  {
    id: 'promises-to-keep',
    title: 'Promises to Keep',
    artist: 'Kevin MacLeod',
    mood: '独奏钢琴，安静的约定',
    duration: 304,
    src: '/audio/promises-to-keep.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1200004'),
  },
  {
    id: 'gymnopedie-no-1',
    title: 'Gymnopedie No. 1',
    artist: 'Kevin MacLeod',
    mood: '萨蒂《裸体歌舞》第一号，Kevin MacLeod 演奏',
    duration: 187,
    src: '/audio/gymnopedie-no-1.mp3',
    changes: '已转码为 96 kbps，未剪辑',
    license: CC_BY_4,
    source: incompetech('USUAN1100787'),
  },
];
