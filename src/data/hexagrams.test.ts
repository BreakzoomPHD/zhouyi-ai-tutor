import { describe, expect, it } from 'vitest';
import { hexagrams } from './hexagrams';

// King Wen order, independent of the data's labels and titles.
const namesInKingWenOrder = [
  '乾', '坤', '屯', '蒙', '需', '讼', '师', '比',
  '小畜', '履', '泰', '否', '同人', '大有', '谦', '豫',
  '随', '蛊', '临', '观', '噬嗑', '贲', '剥', '复',
  '无妄', '大畜', '颐', '大过', '坎', '离', '咸', '恒',
  '遁', '大壮', '晋', '明夷', '家人', '睽', '蹇', '解',
  '损', '益', '夬', '姤', '萃', '升', '困', '井',
  '革', '鼎', '震', '艮', '渐', '归妹', '丰', '旅',
  '巽', '兑', '涣', '节', '中孚', '小过', '既济', '未济',
];

// Each pair is [upper trigram, lower trigram].
const trigramPairsInKingWenOrder = [
  ['乾', '乾'], ['坤', '坤'], ['坎', '震'], ['艮', '坎'],
  ['坎', '乾'], ['乾', '坎'], ['坤', '坎'], ['坎', '坤'],
  ['巽', '乾'], ['乾', '兑'], ['坤', '乾'], ['乾', '坤'],
  ['乾', '离'], ['离', '乾'], ['坤', '艮'], ['震', '坤'],
  ['兑', '震'], ['艮', '巽'], ['坤', '兑'], ['巽', '坤'],
  ['离', '震'], ['艮', '离'], ['艮', '坤'], ['坤', '震'],
  ['乾', '震'], ['艮', '乾'], ['艮', '震'], ['兑', '巽'],
  ['坎', '坎'], ['离', '离'], ['兑', '艮'], ['震', '巽'],
  ['乾', '艮'], ['震', '乾'], ['离', '坤'], ['坤', '离'],
  ['巽', '离'], ['离', '兑'], ['坎', '艮'], ['震', '坎'],
  ['艮', '兑'], ['巽', '震'], ['兑', '乾'], ['乾', '巽'],
  ['兑', '坤'], ['坤', '巽'], ['兑', '坎'], ['坎', '巽'],
  ['兑', '离'], ['离', '巽'], ['震', '震'], ['艮', '艮'],
  ['巽', '艮'], ['震', '兑'], ['震', '离'], ['离', '艮'],
  ['巽', '巽'], ['兑', '兑'], ['巽', '坎'], ['坎', '兑'],
  ['巽', '兑'], ['震', '艮'], ['坎', '离'], ['离', '坎'],
];

const canonicalTrigrams = ['乾', '坤', '震', '巽', '坎', '离', '艮', '兑'];
const removePunctuation = (text: string) => text.replace(/[\s，。；、：！？]/gu, '');

describe('the complete hexagram course', () => {
  it('contains exactly 64 sequential, unique lessons in King Wen order', () => {
    expect(hexagrams).toHaveLength(64);
    expect(hexagrams.map(({ id }) => id)).toEqual(Array.from({ length: 64 }, (_, index) => index + 1));
    expect(new Set(hexagrams.map(({ name }) => name)).size).toBe(64);
    expect(hexagrams.map(({ name }) => name === '遯' ? '遁' : name)).toEqual(namesInKingWenOrder);
  });

  it('uses the correct upper and lower trigrams for every hexagram', () => {
    expect(hexagrams.map(({ upper, lower }) => [upper, lower])).toEqual(trigramPairsInKingWenOrder);
    expect(new Set(hexagrams.flatMap(({ upper, lower }) => [upper, lower]))).toEqual(new Set(canonicalTrigrams));
  });

  it('provides usable readings, practice, reflection and quiz content for every lesson', () => {
    for (const hexagram of hexagrams) {
      const context = `${hexagram.id}. ${hexagram.name}`;
      for (const field of ['name', 'title', 'pinyin', 'judgment', 'theme', 'meaning', 'practice'] as const) {
        expect(hexagram[field].trim(), `${context}: ${field}`).not.toBe('');
      }
      expect(hexagram.reading.length, `${context}: reading`).toBeGreaterThanOrEqual(2);
      expect(hexagram.reflection.length, `${context}: reflection`).toBeGreaterThanOrEqual(1);
      for (const paragraph of [...hexagram.reading, ...hexagram.reflection]) {
        expect(paragraph.trim(), context).not.toBe('');
      }
      expect(hexagram.quiz.question.trim(), `${context}: quiz question`).not.toBe('');
      expect(hexagram.quiz.explanation.trim(), `${context}: quiz explanation`).not.toBe('');
      expect(hexagram.quiz.options.length, `${context}: quiz options`).toBeGreaterThanOrEqual(2);
      expect(new Set(hexagram.quiz.options).size, `${context}: distinct options`).toBe(hexagram.quiz.options.length);
      for (const option of hexagram.quiz.options) expect(option.trim(), context).not.toBe('');
      expect(Number.isInteger(hexagram.quiz.answer), `${context}: answer index`).toBe(true);
      expect(hexagram.quiz.answer, `${context}: answer index`).toBeGreaterThanOrEqual(0);
      expect(hexagram.quiz.answer, `${context}: answer index`).toBeLessThan(hexagram.quiz.options.length);
    }
  });

  it('retains the classical judgments at the boundaries of the course', () => {
    expect(removePunctuation(hexagrams[0].judgment)).toBe('元亨利贞');
    expect(removePunctuation(hexagrams[63].judgment)).toBe('亨小狐汔济濡其尾无攸利');
  });
});
