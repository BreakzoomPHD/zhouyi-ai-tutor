import { commentaryById } from '../data/commentary';
import type { Hexagram } from '../data/hexagrams';
import XiangReading from './XiangReading';

const trigramImages: Record<string, string> = {
  乾: '天', 坤: '地', 震: '雷', 巽: '风、木',
  坎: '水', 离: '火', 艮: '山', 兑: '泽',
};

export function JudgmentReading({ lesson }: { lesson: Hexagram }) {
  const commentary = commentaryById[lesson.id];
  return <>
    <div className="section-kicker">读卦辞，先知大意</div>
    <section className="lesson-original" aria-labelledby="judgment-title">
      <h3 className="content-title" id="judgment-title">卦辞原文</h3>
      <div className="original-label">《周易》· {lesson.name}卦</div>
      <blockquote className="judgment">{lesson.judgment}</blockquote>
    </section>
    <section className="judgment-translation" aria-labelledby="translation-title">
      <h3 className="content-title" id="translation-title">卦辞白话</h3>
      <p className="reading-paragraph">{commentary.translation}</p>
    </section>
    <section className="keywords-section" aria-labelledby="keywords-title">
      <h3 className="content-title" id="keywords-title">关键词</h3>
      <dl className="keywords-list">
        {commentary.keywords.map(({ term, explanation }) => <div className="keyword-item" key={term}>
          <dt>{term}</dt><dd>{explanation}</dd>
        </div>)}
      </dl>
    </section>
    <p className="inline-note">白话译文采用便于入门的常见传统解释。「贞」本与占问有关，传统义理解释也常作守正；具体字义可结合注疏继续辨析。</p>
  </>;
}

export function HexagramReading({ lesson }: { lesson: Hexagram }) {
  const commentary = commentaryById[lesson.id];
  return <>
    <XiangReading lesson={lesson} />
    <div className="section-kicker">卦解 · 从卦象到卦意</div>
    <section className="image-explanation" aria-labelledby="image-title">
      <h3 className="content-title" id="image-title">卦象解读</h3>
      <div className="trigram-pair">
        <span>上卦 · {lesson.upper}为{trigramImages[lesson.upper]}</span>
        <span>下卦 · {lesson.lower}为{trigramImages[lesson.lower]}</span>
      </div>
      <p className="reading-paragraph">{commentary.imageExplanation}</p>
    </section>
    <section className="hexagram-commentary" aria-labelledby="commentary-title">
      <h3 className="content-title" id="commentary-title">卦意解读</h3>
      <p className="commentary-summary">{lesson.meaning}</p>
      {lesson.reading.map((paragraph, i) => <p className="reading-paragraph" key={i}>{paragraph}</p>)}
    </section>
    <div className="learning-prompt"><div><strong>带着问题读</strong><p>这段话适用于什么处境？换一种处境，它的提醒是否也会改变？</p></div></div>
    <p className="inline-note">卦解与生活启发为现代入门解读。不同注家对经典有不同解释，可以保留疑问，再回到原文比较。</p>
  </>;
}
