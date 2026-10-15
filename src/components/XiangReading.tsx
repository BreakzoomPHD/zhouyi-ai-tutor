import { xiangById } from '../data/xiang';
import type { Hexagram } from '../data/hexagrams';

export default function XiangReading({ lesson }: { lesson: Hexagram }) {
  const xiang = xiangById[lesson.id];
  return <section className="xiang-reading" aria-label={`${lesson.name}卦大象辞及辞解`}>
    <div className="section-kicker">《象传》· 大象</div>
    <section className="lesson-original xiang-original" aria-labelledby="xiang-original-title">
      <h3 className="content-title" id="xiang-original-title">象辞原文</h3>
      <div className="original-label">《周易》· {lesson.name}卦 · 大象</div>
      <blockquote className="xiang-text">{xiang.original}</blockquote>
    </section>
    <section className="xiang-translation" aria-labelledby="xiang-translation-title">
      <h3 className="content-title" id="xiang-translation-title">象辞白话</h3>
      <p className="reading-paragraph">{xiang.translation}</p>
    </section>
    <section className="xiang-clauses" aria-labelledby="xiang-clauses-title">
      <h3 className="content-title" id="xiang-clauses-title">象辞辞解</h3>
      {xiang.clauses.map(({ text, explanation }, index) => <article className="xiang-clause" key={text}>
        <span className="clause-number" aria-hidden="true">0{index + 1}</span>
        <div><h4>{text}</h4><p className="reading-paragraph">{explanation}</p></div>
      </article>)}
    </section>
    <p className="inline-note">大象辞解说整卦之象，常由自然之象引出修身或治事的启发。本课收录每卦的大象；逐爻的小象将在深入爻辞时阅读。白话与辞解为现代入门解释。</p>
  </section>;
}
