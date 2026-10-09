import { chooseHold, options } from './logic';
self.onmessage = (e) => {
  try {
    const { dice, card, difficulty } = e.data;
    if (
      !Array.isArray(dice) ||
      !card ||
      !Object.keys(options(dice, card)).length ||
      !['easy', 'normal'].includes(difficulty)
    )
      throw new Error('Invalid AI observation');
    self.postMessage(chooseHold(dice, card, difficulty));
  } catch {
    self.postMessage({ error: 'AI 无法分析此快照' });
  }
};
