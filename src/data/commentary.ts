import { commentaryFirst } from './commentary-first';
import { commentarySecond } from './commentary-second';

export interface HexagramCommentary {
  translation: string;
  imageExplanation: string;
  keywords: { term: string; explanation: string }[];
}

/** 白话译文与卦解为现代入门材料，经典原文保留在 hexagrams.ts。 */
export const commentaryById: Record<number, HexagramCommentary> = {
  ...commentaryFirst,
  ...commentarySecond,
};
