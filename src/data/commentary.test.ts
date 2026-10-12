import { describe, expect, it } from 'vitest';
import { hexagrams } from './hexagrams';
import { commentaryById } from './commentary';
import { commentaryFirst } from './commentary-first';
import { commentarySecond } from './commentary-second';

describe('judgment translations and hexagram explanations', () => {
  it('covers every lesson exactly once across the two course sections', () => {
    expect(Object.keys(commentaryFirst).map(Number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 1));
    expect(Object.keys(commentarySecond).map(Number)).toEqual(Array.from({ length: 32 }, (_, i) => i + 33));
    expect(Object.keys(commentaryById).map(Number)).toEqual(hexagrams.map(lesson => lesson.id));
  });

  it('gives every original judgment a distinct translation and image explanation', () => {
    for (const lesson of hexagrams) {
      const commentary = commentaryById[lesson.id];
      expect(commentary.translation.trim(), lesson.title).not.toBe('');
      expect(commentary.translation.trim(), lesson.title).not.toBe(lesson.judgment);
      expect(commentary.translation.trim(), lesson.title).not.toBe(lesson.meaning);
      expect(commentary.imageExplanation.trim(), lesson.title).not.toBe('');
      expect(commentary.imageExplanation.trim(), lesson.title).not.toBe(lesson.meaning);
    }
  });

  it('explains two to four distinct terms that actually occur in each judgment', () => {
    for (const lesson of hexagrams) {
      const { keywords } = commentaryById[lesson.id];
      expect(keywords.length, lesson.title).toBeGreaterThanOrEqual(2);
      expect(keywords.length, lesson.title).toBeLessThanOrEqual(4);
      expect(new Set(keywords.map(item => item.term)).size, lesson.title).toBe(keywords.length);
      for (const { term, explanation } of keywords) {
        expect(term.trim(), lesson.title).not.toBe('');
        expect(lesson.judgment.includes(term), `${lesson.title}: ${term}`).toBe(true);
        expect(explanation.trim(), `${lesson.title}: ${term}`).not.toBe('');
      }
    }
  });

  it('keeps ancient details rather than replacing the translation with a life tip', () => {
    expect(commentaryById[2].translation).toMatch(/西南/);
    expect(commentaryById[2].translation).toMatch(/东北/);
    expect(commentaryById[2].translation).toMatch(/母马|牝马/);
    expect(commentaryById[4].translation).toMatch(/占|筮/);
    expect(commentaryById[64].translation).toMatch(/狐/);
    expect(commentaryById[64].translation).toMatch(/尾/);
  });
});
