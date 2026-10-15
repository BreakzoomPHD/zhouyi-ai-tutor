import { describe, expect, it } from 'vitest';
import { hexagrams } from './hexagrams';
import { xiangById } from './xiang';
import { xiangFirst } from './xiang-first';
import { xiangSecond } from './xiang-second';

const withoutPunctuation = (text: string) => text.replace(/[\s，。；、：！？]/gu, '');

describe('the Great Image texts and explanations', () => {
  it('provides exactly one Great Image for every hexagram in order', () => {
    expect(Object.keys(xiangFirst).map(Number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    expect(Object.keys(xiangSecond).map(Number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 33));
    expect(Object.keys(xiangById).map(Number)).toEqual(hexagrams.map(lesson => lesson.id));
  });

  it('retains received classical wording at representative boundaries and historic applications', () => {
    expect(withoutPunctuation(xiangById[1].original)).toBe('象曰天行健君子以自强不息');
    expect(withoutPunctuation(xiangById[2].original)).toBe('象曰地势坤君子以厚德载物');
    expect(withoutPunctuation(xiangById[8].original)).toBe('象曰地上有水比先王以建万国亲诸侯');
    expect(withoutPunctuation(xiangById[63].original)).toBe('象曰水在火上既济君子以思患而豫防之');
    expect(withoutPunctuation(xiangById[64].original)).toBe('象曰火在水上未济君子以慎辨物居方');
  });

  it('translates every text and explains two exact, ordered clauses without omission', () => {
    for (const lesson of hexagrams) {
      const xiang = xiangById[lesson.id];
      expect(xiang.original.startsWith('象曰：'), lesson.title).toBe(true);
      expect(xiang.translation.trim(), lesson.title).not.toBe('');
      expect(xiang.translation, lesson.title).not.toBe(xiang.original);
      expect(xiang.clauses, lesson.title).toHaveLength(2);
      expect(new Set(xiang.clauses.map(clause => clause.text)).size, lesson.title).toBe(2);
      for (const { text, explanation } of xiang.clauses) {
        expect(text.trim(), lesson.title).not.toBe('');
        expect(xiang.original.includes(text), `${lesson.title}: ${text}`).toBe(true);
        expect(explanation.trim(), `${lesson.title}: ${text}`).not.toBe('');
      }
      expect(xiang.original.indexOf(xiang.clauses[0].text), lesson.title)
        .toBeLessThan(xiang.original.indexOf(xiang.clauses[1].text));
      const joined = xiang.clauses.map(clause => clause.text).join('');
      expect(withoutPunctuation(joined), `${lesson.title}: full text coverage`)
        .toBe(withoutPunctuation(xiang.original.replace(/^象曰：/, '')));
    }
  });
});
