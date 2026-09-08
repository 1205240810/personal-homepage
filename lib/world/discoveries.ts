export const DISCOVERIES = [
  {
    id: 'sleepy-eye',
    title: '一段未署名的电波',
    text: '电台里传来一个很轻的声音：「收到。今天也辛苦了。」信号灯又闪了两下。',
    again: '还是那个频道。没有新消息，只有很轻的沙沙声。',
    color: 0xeab976,
  },
  {
    id: 'paper-crane',
    title: '折在书页里的纸鹤',
    text: '纸鹤下面压着一行铅笔字：「慢慢读，这里没有截止日期。」',
    again: '纸鹤还守着这一页。你把书角轻轻压平了。',
    color: 0xf3deaa,
  },
  {
    id: 'pocket-mecha',
    title: '值班中的小机甲',
    text: '小机甲亮起镜头，认真地完成了一次自检：「电量充足。今日任务：陪你发呆。」',
    again: '它抬了抬镜头：「正在执行今日任务。请勿催促。」',
    color: 0x95ccc1,
  },
] as const;
export type DiscoveryId =
  | (typeof DISCOVERIES)[number]['id']
  | 'maintenance-cat';
export const getDiscovery = (id: string) =>
  DISCOVERIES.find((d) => d.id === id);
