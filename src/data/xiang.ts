import { xiangFirst } from './xiang-first';
import { xiangSecond } from './xiang-second';

export interface HexagramXiang {
  original: string;
  translation: string;
  clauses: { text: string; explanation: string }[];
}

/** 每卦一篇《象传》大象；白话译文与辞解为现代入门材料。 */
export const xiangById: Record<number, HexagramXiang> = {
  ...xiangFirst,
  ...xiangSecond,
};
