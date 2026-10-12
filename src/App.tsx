import { useEffect, useMemo, useState } from 'react';
import { hexagrams, type Hexagram } from './data/hexagrams';
import { JudgmentReading, HexagramReading } from './components/LessonReading';
import {
  calculateStreak, completionCount, createProgress, dailyLessonId,
  localDate, markComplete, parseProgress, saveNote, type Progress,
} from './lib/progress';

const STORAGE_KEY = 'guanyi.progress.v1';
const trigrams: Record<string, number[]> = {
  乾: [1, 1, 1], 兑: [1, 1, 0], 离: [1, 0, 1], 震: [1, 0, 0],
  巽: [0, 1, 1], 坎: [0, 1, 0], 艮: [0, 0, 1], 坤: [0, 0, 0],
};
type View = 'today' | 'catalog' | 'history' | 'methods';
type IconName = 'book' | 'grid' | 'history' | 'leaf' | 'arrow' | 'check' | 'search' | 'sun' | 'flame' | 'pen';
const iconPaths: Record<IconName, string> = {
  book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  history: 'M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v5l3 2',
  leaf: 'M20 3c-9 0-16 3-16 10a7 7 0 0 0 7 7c7 0 9-8 9-17ZM4 21 15 10',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  check: 'm5 12 4 4L19 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
  flame: 'M12 3c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-6 4-8 0 3 1 4 2 5 1-3 1-5 0-8Z',
  pen: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z',
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]} /></svg>;
}
function HexagramArt({ lesson, small = false }: { lesson: Hexagram; small?: boolean }) {
  const lines = [...trigrams[lesson.lower], ...trigrams[lesson.upper]].reverse();
  return <div className={small ? 'mini-hexagram' : 'hexagram-art'} role="img" aria-label={`${lesson.title}，上${lesson.upper}下${lesson.lower}`}>
    {lines.map((line, i) => <div key={i} className={`hexagram-line ${line ? 'yang' : 'yin'}`}><span />{!line && <span />}</div>)}
  </div>;
}
function readProgress(today: string): Progress {
  try { return parseProgress(localStorage.getItem(STORAGE_KEY), today); }
  catch { return createProgress(today); }
}
function readableDate(value: string, short = false) {
  return new Intl.DateTimeFormat('zh-CN', short ? { month: 'long', day: 'numeric' } : { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${value}T12:00:00`));
}
function keyboardIndex(key: string, current: number, length: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % length;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current + length - 1) % length;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

export default function App() {
  const [today, setToday] = useState(() => localDate());
  const [progress, setProgress] = useState(() => readProgress(localDate()));
  const [view, setView] = useState<View>('today');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'done'>('all');
  const [toast, setToast] = useState('');
  const [storageIssue, setStorageIssue] = useState(false);
  const dueId = dailyLessonId(progress, today);
  const lesson = hexagrams[(selectedId ?? dueId) - 1];
  const count = completionCount(progress);
  const streak = calculateStreak(progress, today);
  const completed = Boolean(progress.completed[String(lesson.id)]);
  const isDaily = lesson.id === dueId;
  const correct = checked && answer === lesson.quiz.answer;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); setStorageIssue(false); }
    catch { setStorageIssue(true); }
  }, [progress]);
  useEffect(() => {
    const refreshDate = () => setToday(localDate());
    const timer = window.setInterval(refreshDate, 30_000);
    window.addEventListener('focus', refreshDate);
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setProgress(parseProgress(event.newValue, localDate()));
    };
    window.addEventListener('storage', sync);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshDate); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => { setStep(0); setAnswer(null); setChecked(false); }, [lesson.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => hexagrams.filter(item => {
    const query = search.trim().toLowerCase();
    const matches = `${item.id} ${item.name} ${item.title} ${item.pinyin} ${item.theme}`.toLowerCase().includes(query);
    return matches && (filter === 'all' || (filter === 'done' ? Boolean(progress.completed[String(item.id)]) : !progress.completed[String(item.id)]));
  }), [search, filter, progress.completed]);

  const navigate = (next: View) => {
    setView(next);
    if (next === 'today') { setSelectedId(null); setStep(0); setChecked(false); setAnswer(null); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openLesson = (id: number) => {
    setSelectedId(id); setView('today'); setStep(0); setAnswer(null); setChecked(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const changeStep = (next: number) => {
    setStep(next);
    window.requestAnimationFrame(() => {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      document.getElementById('study-title')?.scrollIntoView({ block: 'start', behavior });
    });
  };
  const complete = () => {
    if (!correct || !isDaily || completed) return;
    setProgress(previous => markComplete(previous, lesson.id, today));
    setToast('今日学习已记录。给自己一点时间，让所学慢慢沉淀。');
  };
  const nav: { view: View; icon: IconName; text: string }[] = [
    { view: 'today', icon: 'book', text: '今日学习' },
    { view: 'catalog', icon: 'grid', text: '六十四卦' },
    { view: 'history', icon: 'history', text: '学习记录' },
    { view: 'methods', icon: 'leaf', text: '学习方法' },
  ];
  const steps = ['卦辞', '卦解', '联系生活', '温故小测'];

  return <div className="app-shell">
    <aside className="sidebar" aria-label="主导航">
      <button className="brand" onClick={() => navigate('today')} aria-label="观易首页">
        <span className="brand-mark"><span /><span /><span /></span>
        <span className="brand-copy">观易<span className="brand-caption">GUAN YI · 每日一卦</span></span>
      </button>
      <div className="sidebar-label">我的学习</div>
      <nav className="nav-list">{nav.map(item => <button key={item.view} className={`nav-item ${view === item.view ? 'active' : ''}`} aria-current={view === item.view ? 'page' : undefined} onClick={() => navigate(item.view)}><span className="nav-icon"><Icon name={item.icon} /></span><span className="nav-text">{item.text}</span>{item.view === 'today' && <span className="nav-badge">{progress.completed[String(dueId)] ? '已学' : '1'}</span>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-quote"><Icon name="leaf" size={25} /><p>一日一卦<br />在变化中，找到从容。</p><span>循序 · 静心 · 致用</span></div>
        <div className="profile"><span className="avatar">习</span><div><div className="profile-name">易学同行者</div><div className="profile-detail">第 {Math.min(count + 1, 64)} 课的旅程</div></div></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb">学而时习 <span>/</span> {nav.find(item => item.view === view)?.text}</div><div className="topbar-meta"><Icon name="sun" size={17} /><span className="date-label">{readableDate(today)}</span></div></header>
      {storageIssue && <div className="notice-box" role="alert">浏览器暂时无法保存数据。你仍可学习，但刷新后可能丢失进度；请检查浏览器的存储设置。</div>}

      {view === 'today' && <>
        <section className="page-heading"><div className="eyebrow">DAILY PRACTICE · 每日一卦</div><div className="heading-row"><h1>留一刻时间，读懂一卦。</h1><span className="streak-badge"><Icon name="flame" size={17} /> 连续学习 {streak} 天</span></div><p className="page-description">以经典为起点，以生活为注脚。每天一小步，慢慢读懂《周易》。</p></section>
        {selectedId !== null && !isDaily && <div className="viewing-banner"><span>{completed ? '正在回顾已学课程' : '正在预习课程'} · 完成记录从今日课程按顺序推进</span><button className="button quiet" onClick={() => navigate('today')}>返回今日学习 <Icon name="arrow" size={16} /></button></div>}
        <section className="lesson-hero" aria-label="本课概览"><div className="hero-copy"><div className="lesson-label"><span className="lesson-number">第 {String(lesson.id).padStart(2, '0')} 卦</span><span>{completed ? '已完成 · 温故知新' : isDaily ? '今日课程' : '课程预习'}</span></div><h2 className="hero-title">{lesson.title}<span className="hero-subtitle">{lesson.pinyin}</span></h2><p className="hero-description">{lesson.meaning}</p><div className="hero-meta"><span className="tag">{lesson.theme}</span><span>约 10–15 分钟</span><span>上{lesson.upper} · 下{lesson.lower}</span></div></div><div className="hero-art"><div className="hero-circle" /><HexagramArt lesson={lesson} /><span className="trigram-label">{lesson.name} · 第 {lesson.id} 卦</span></div></section>
        <div className="dashboard-grid">
          <section className="study-card" aria-labelledby="study-title"><div className="study-header"><div><span className="section-kicker">循序而学</span><h2 className="study-heading" id="study-title">今天，从这里开始</h2></div><span className="study-summary">{step + 1} / 4</span></div>
            <div className="step-tabs" role="tablist" aria-label="课程步骤">{steps.map((title, index) => <button className={`step-tab ${step === index ? 'active' : ''} ${step > index ? 'done' : ''}`} id={`step-${index}`} key={title} role="tab" tabIndex={step === index ? 0 : -1} aria-selected={step === index} aria-controls="lesson-panel" onClick={() => setStep(index)} onKeyDown={event => { const next = keyboardIndex(event.key, index, steps.length); if (next !== null) { event.preventDefault(); setStep(next); document.getElementById(`step-${next}`)?.focus(); } }}><span className="step-number">{step > index ? <Icon name="check" size={14} /> : `0${index + 1}`}</span><span className="step-title">{title}</span></button>)}</div>
            <div className="study-content" id="lesson-panel" role="tabpanel" aria-labelledby={`step-${step}`}>
              {step === 0 && <JudgmentReading lesson={lesson} />}
              {step === 1 && <HexagramReading lesson={lesson} />}
              {step === 2 && <><div className="section-kicker">把一卦，放进今天的生活</div><div className="learning-prompt"><Icon name="pen" /><div><strong>今日小练习</strong><p>{lesson.practice}</p></div></div><div className="reflection-list">{lesson.reflection.map((question, i) => <div className="reflection-item" key={question}><span>0{i + 1}</span><p>{question}</p></div>)}</div><label className="note-label" htmlFor="reflection-note">留下一点思考 <span>选填 · 自动保存在当前浏览器</span></label><textarea className="note-input" id="reflection-note" value={progress.notes[String(lesson.id)] ?? ''} maxLength={10000} placeholder="也许是一件小事，一个疑问，或今天想做的改变……" onChange={event => setProgress(previous => saveNote(previous, lesson.id, event.target.value))} /><div className="character-count">{(progress.notes[String(lesson.id)] ?? '').length} / 10000</div></>}
              {step === 3 && <><div className="section-kicker">温故小测 · 用理解代替死记</div><h3>{lesson.quiz.question}</h3><div className="quiz-options" role="radiogroup" aria-label="小测答案">{lesson.quiz.options.map((option, index) => <button key={option} id={`quiz-option-${index}`} role="radio" tabIndex={(answer ?? 0) === index ? 0 : -1} aria-checked={answer === index} className={`quiz-option ${answer === index ? 'selected' : ''} ${checked && index === lesson.quiz.answer ? 'correct' : ''} ${checked && answer === index && !correct ? 'incorrect' : ''}`} onClick={() => { setAnswer(index); setChecked(false); }} onKeyDown={event => { const next = keyboardIndex(event.key, index, lesson.quiz.options.length); if (next !== null) { event.preventDefault(); setAnswer(next); setChecked(false); document.getElementById(`quiz-option-${next}`)?.focus(); } }}><span className="option-letter">{String.fromCharCode(65 + index)}</span>{option}{checked && index === lesson.quiz.answer && <Icon name="check" size={18} />}</button>)}</div>{checked && <div className={`quiz-feedback ${correct ? 'success' : 'error'}`} role="status"><strong>{correct ? '理解得很好。' : '再想一想，也可以回看导读。'}</strong><p>{lesson.quiz.explanation}</p></div>}{!correct && <button className="button secondary" disabled={answer === null} onClick={() => setChecked(true)}>检验理解 <Icon name="arrow" size={17} /></button>}{correct && !completed && !isDaily && <p className="inline-note">预习已完成。回到今日课程，按顺序记录每天的学习。</p>}{completed && <div className="complete-panel"><span className="complete-icon"><Icon name="check" /></span><div><strong>这一卦，已经留下你的足迹。</strong><p>{count === 64 ? '六十四卦初读已完成。回看笔记，开始第二遍阅读吧。' : isDaily && progress.completed[String(lesson.id)] === today ? '今日学习已完成，明天继续下一卦。也可以回看笔记，让理解沉淀。' : '你可以重新阅读、练习，或补充这次的学习笔记。'}</p></div></div>}</>}
            </div>
            <div className="study-footer"><button className="button quiet" disabled={step === 0} onClick={() => changeStep(step - 1)}>上一步</button>{step < 3 ? <button className="button primary" onClick={() => changeStep(step + 1)}>继续：{steps[step + 1]} <Icon name="arrow" size={17} /></button> : !completed && isDaily ? <button className="button primary" disabled={!correct} onClick={complete}>完成今日学习 <Icon name="check" size={18} /></button> : <button className="button secondary" onClick={() => navigate('catalog')}>回到六十四卦 <Icon name="arrow" size={17} /></button>}</div>
          </section>
          <aside className="side-stack" aria-label="学习进度和提示"><section className="side-card"><h2 className="card-title">你的学习旅程</h2><div className="progress-row"><div className="progress-value">{count}<span> / 64 卦</span></div><span className="status-pill">{Math.round(count / 64 * 100)}%</span></div><div className="progress-track" role="progressbar" aria-label="课程完成进度" aria-valuenow={count} aria-valuemin={0} aria-valuemax={64}><span style={{ width: `${count / 64 * 100}%` }} /></div><p className="progress-caption">不求速成，日有所进。</p><div className="plan-days">{Array.from({ length: 7 }, (_, i) => Math.min(Math.max(dueId - 3, 1), 58) + i).map(id => <span key={id} className={`${progress.completed[String(id)] ? 'done' : ''} ${id === dueId ? 'today' : ''}`} title={`第 ${id} 卦${progress.completed[String(id)] ? '已学' : ''}`}>{progress.completed[String(id)] ? <Icon name="check" size={14} /> : id}</span>)}</div><button className="card-link" onClick={() => navigate('history')}>查看学习记录 <Icon name="arrow" size={16} /></button></section><section className="side-card"><span className="focus-icon"><Icon name="leaf" size={25} /></span><h2 className="card-title">读易，也是在读自己</h2><p className="focus-text">不急着寻找一个标准答案。先观察此刻的处境，再想想自己可以如何行动。</p><button className="card-link" onClick={() => navigate('methods')}>了解学习方法 <Icon name="arrow" size={16} /></button></section><div className="inline-note">每日按你的本地日期更新。错过一天也没关系，我们从下一卦继续。</div></aside>
        </div>
      </>}

      {view === 'catalog' && <><section className="page-heading"><div className="eyebrow">THE 64 HEXAGRAMS · 经典次第</div><h1>六十四卦，六十四种启发。</h1><p className="page-description">按通行本卦序循序学习。随时回顾，也可以先看看下一站。</p></section><div className="catalog-tools"><div className="search-box"><Icon name="search" /><input className="search-input" type="search" aria-label="搜索卦名、序号或主题" placeholder="搜索卦名、序号或主题" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="filter-buttons" aria-label="课程筛选">{(['all', 'new', 'done'] as const).map(value => <button key={value} aria-pressed={filter === value} className={`filter-button ${filter === value ? 'active' : ''}`} onClick={() => setFilter(value)}>{value === 'all' ? '全部 64' : value === 'new' ? `未学 ${64 - count}` : `已学 ${count}`}</button>)}</div></div><div className="catalog-grid">{filtered.map(item => <button key={item.id} className={`hexagram-card ${item.id === dueId ? 'active' : ''} ${progress.completed[String(item.id)] ? 'completed' : ''}`} onClick={() => openLesson(item.id)} aria-label={`第${item.id}卦 ${item.title}`}><div className="hexagram-card-top"><span className="hexagram-card-number">{String(item.id).padStart(2, '0')}</span><HexagramArt lesson={item} small /></div><h2 className="hexagram-card-title">{item.title}</h2><p className="hexagram-card-theme">{item.theme}</p><span className="hexagram-card-status">{progress.completed[String(item.id)] ? '已完成 ✓' : item.id === dueId ? '今日学习 →' : '阅读课程 →'}</span></button>)}</div>{filtered.length === 0 && <div className="empty-state"><Icon name="search" size={30} /><h2>这里还没有匹配的课程</h2><p>试试其他卦名，或切换课程筛选。</p><button className="button secondary" onClick={() => { setSearch(''); setFilter('all'); }}>显示全部课程</button></div>}</>}

      {view === 'history' && <><section className="page-heading"><div className="eyebrow">YOUR JOURNEY · 日有所进</div><h1>每一步，都算数。</h1><p className="page-description">回看你读过的卦，也回看那个正在慢慢成长的自己。</p></section><div className="history-stats"><div className="stat-card"><div className="stat-value">{count}<span> 卦</span></div><div className="stat-label">已完成学习</div></div><div className="stat-card"><div className="stat-value">{streak}<span> 天</span></div><div className="stat-label">连续学习</div></div><div className="stat-card"><div className="stat-value">{Object.values(progress.notes).filter(note => note.trim()).length}<span> 篇</span></div><div className="stat-label">留下的思考</div></div></div>{count === 0 ? <div className="empty-state"><Icon name="book" size={32} /><h2>第一步，就从今天开始。</h2><p>完成今日小测后，点击「完成今日学习」，这里会留下你的足迹。</p><button className="button primary" onClick={() => navigate('today')}>开始今日学习 <Icon name="arrow" /></button></div> : <div className="history-list">{Object.entries(progress.completed).sort((a, b) => b[1].localeCompare(a[1]) || Number(b[0]) - Number(a[0])).map(([id, date]) => { const item = hexagrams[Number(id) - 1]; return <article key={id} className="history-item"><span className="history-symbol">{String.fromCodePoint(0x4dc0 + item.id - 1)}</span><div className="history-body"><h2>{item.title}<span className="history-date">{readableDate(date, true)}</span></h2><p>{item.theme}</p>{progress.notes[id]?.trim() && <p className="history-note">{progress.notes[id]}</p>}</div><button className="button quiet" onClick={() => openLesson(item.id)} aria-label={`回顾${item.title}`}>回顾 <Icon name="arrow" size={17} /></button></article>; })}</div>}<div className="notice-box">进度与笔记仅保存在当前浏览器，清除网站数据会删除记录；暂未提供账号同步。所有课程笔记都可在对应课程的「联系生活」中查看和修改。</div></>}

      {view === 'methods' && <><section className="page-heading"><div className="eyebrow">A WAY TO LEARN · 致知力行</div><h1>慢慢读，慢慢懂。</h1><p className="page-description">给自己十来分钟，把古老的文字和今天的生活连接起来。</p></section><div className="methods-grid">{[
        ['先读卦辞', '先读原文，再对照白话译文和关键词。留意占筮、祭祀等古代语境，把不懂的字记下来，不必立刻得到所有答案。'],
        ['细读卦解', '从上下卦的自然之象理解关系，再读卦意解说和生活启发。区分经典原文、现代解释与自己的联想，避免脱离情境套用一句话。'],
        ['联系生活', '用一个小练习观察自己，把启发写进笔记。我们学习的是思考和行动的方式，而非预测未来。'],
        ['温故再进', '完成一道小测，记录今日学习。每天只新增一卦，按顺序推进；漏学不会跳过，预习和回顾不限次数。'],
      ].map(([title, body], i) => <article className="method-card" key={title}><span className="method-number">0{i + 1}</span><h2 className="method-title">{title}</h2><p className="method-body">{body}</p></article>)}</div><div className="notice-box"><strong>关于内容</strong><p>课程以通行本《周易》六十四卦卦辞为原文，采用简体字；各版本在字形、标点上可能有差异。卦辞白话、关键词、卦象和卦意解读、练习与测验为本项目编写的入门材料，译文采用常见传统解释，不代表唯一训诂，也不是古代注疏。初版聚焦卦辞，后续可以逐步深入爻辞与《十翼》。</p></div><button className="button primary" onClick={() => navigate('today')}>开始今天的一卦 <Icon name="arrow" /></button></>}
      <footer className="footer"><span>观易 · 与经典同行</span><span>一日一卦，学以致用。</span></footer>
    </main>
    {toast && <div className="toast" role="status"><Icon name="check" size={18} />{toast}</div>}
  </div>;
}
