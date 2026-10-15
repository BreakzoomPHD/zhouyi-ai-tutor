import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5173';
const STORAGE_KEY = 'guanyi.progress.v1';
const launchOptions = {
  headless: true,
  chromiumSandbox: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
};

async function launchBrowser() {
  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    if (!/sandbox|namespace|Operation not permitted/i.test(String(error))) throw error;
    console.log('Chromium sandbox is unavailable in this container; retrying with --no-sandbox.');
    return chromium.launch({ ...launchOptions, chromiumSandbox: false, args: ['--no-sandbox'] });
  }
}

const browser = await launchBrowser();
const failures = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  const observeErrors = target => {
    target.on('console', message => {
      if (message.type() === 'error') failures.push(`Console: ${message.text()}`);
    });
    target.on('pageerror', error => failures.push(`Page: ${error.message}`));
  };
  observeErrors(page);

  const nav = name => page.locator('.nav-list').getByRole('button', { name: new RegExp(name) });
  const tab = name => page.getByRole('tab', { name: new RegExp(name) });
  const storage = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  const waitForStoredCount = count => page.waitForFunction(({ key, expected }) => {
    try {
      return Object.keys(JSON.parse(localStorage.getItem(key)).completed).length === expected;
    } catch {
      return false;
    }
  }, { key: STORAGE_KEY, expected: count });
  const assertLesson = async id => {
    const expected = `第 ${String(id).padStart(2, '0')} 卦`;
    await page.waitForFunction(text => document.querySelector('.lesson-number')?.textContent === text, expected);
  };
  const assertNoOverflow = async view => {
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }));
    assert(dimensions.content <= dimensions.width + 1, `${view} overflows horizontally: ${JSON.stringify(dimensions)}`);
  };

  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await assertLesson(1);
  assert.equal(await page.getByRole('tab').count(), 4, 'Image reading should keep the existing four-step learning flow.');
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');

  // Read the actual course module so the test does not hard-code an answer.
  const lessons = await page.evaluate(async () => {
    const [{ hexagrams }, { commentaryById }, { xiangById }] = await Promise.all([
      import('/src/data/hexagrams.ts'), import('/src/data/commentary.ts'), import('/src/data/xiang.ts'),
    ]);
    return hexagrams.map(({ id, title, judgment, upper, lower, reading, quiz }) => ({
      id, title, judgment, upper, lower, reading, quiz, commentary: commentaryById[id], xiang: xiangById[id],
    }));
  });
  assert.equal(lessons.length, 64);
  const assertCommentary = async id => {
    const lesson = lessons[id - 1];
    await tab('卦辞').click();
    await page.getByRole('heading', { name: '卦辞原文', exact: true }).waitFor();
    const original = (await page.locator('.judgment').textContent()).trim();
    const translation = (await page.locator('.judgment-translation p').textContent()).trim();
    assert.equal(original, lesson.judgment, `Lesson ${id} should preserve its classical text.`);
    assert(translation.length > 8, `Lesson ${id} needs a substantive translation.`);
    assert.notEqual(translation, original, `Lesson ${id} should distinguish translation from original text.`);
    assert.equal(translation, lesson.commentary.translation, `Lesson ${id} should show its own translation.`);
    await page.locator('.judgment-translation').getByRole('heading', { name: '卦辞白话', exact: true }).waitFor();
    await page.getByRole('heading', { name: '关键词', exact: true }).waitFor();
    const keywords = await page.locator('.keywords-list .keyword-item').evaluateAll(items => items.map(item => ({
      term: item.querySelector('dt')?.textContent?.trim(),
      explanation: item.querySelector('dd')?.textContent?.trim(),
    })));
    assert(keywords.length > 0, `Lesson ${id} needs rendered keywords.`);
    assert(keywords.every(({ term, explanation }) => term && explanation), `Lesson ${id} has an empty keyword definition.`);
    assert.deepEqual(keywords, lesson.commentary.keywords, `Lesson ${id} should render all of its keyword definitions.`);
    await page.getByRole('button', { name: '继续：卦解', exact: true }).click();
    await page.waitForFunction(() => {
      const heading = document.getElementById('study-title')?.getBoundingClientRect();
      return heading && heading.top >= 0 && heading.bottom <= window.innerHeight;
    });
    assert.equal(await tab('卦解').getAttribute('aria-selected'), 'true');
    await page.locator('.image-explanation').getByRole('heading', { name: '卦象解读', exact: true }).waitFor();
    const trigramLabels = await page.locator('.trigram-pair span').allTextContents();
    assert.equal(trigramLabels.length, 2);
    assert.match(trigramLabels[0], new RegExp(`^上卦.*${lesson.upper}为`), `Lesson ${id} should identify its upper trigram.`);
    assert.match(trigramLabels[1], new RegExp(`^下卦.*${lesson.lower}为`), `Lesson ${id} should identify its lower trigram.`);
    const imagery = (await page.locator('.image-explanation p').textContent()).trim();
    assert(imagery.length > 12, `Lesson ${id} needs an explanation of its image.`);
    assert.equal(imagery, lesson.commentary.imageExplanation, `Lesson ${id} should show its own image explanation.`);
    const xiang = lesson.xiang;
    await page.locator('.xiang-original').getByRole('heading', { name: '象辞原文', exact: true }).waitFor();
    const xiangOriginal = (await page.locator('.xiang-text').textContent()).trim();
    assert.match(xiangOriginal, /^象曰：/, `Lesson ${id} should identify its classical Image text.`);
    assert.equal(xiangOriginal.replace(/^象曰：\s*/, ''), xiang.original.replace(/^象曰：\s*/, ''),
      `Lesson ${id} should show its own complete Image text.`);
    await page.locator('.xiang-translation').getByRole('heading', { name: '象辞白话', exact: true }).waitFor();
    const xiangTranslation = (await page.locator('.xiang-translation p').textContent()).trim();
    assert.equal(xiangTranslation, xiang.translation, `Lesson ${id} should show its Image translation.`);
    assert.notEqual(xiangTranslation, xiangOriginal, `Lesson ${id} should distinguish Image text from its translation.`);
    await page.locator('.xiang-clauses').getByRole('heading', { name: '象辞辞解', exact: true }).waitFor();
    const clauses = await page.locator('.xiang-clause').evaluateAll(items => items.map(item => ({
      text: item.querySelector('h4')?.textContent?.trim().replace(/^[「『“"]/, '').replace(/[」』”"]$/, ''),
      explanation: item.querySelector('p')?.textContent?.trim(),
    })));
    assert.equal(clauses.length, 2, `Lesson ${id} should explain both nature and human-action clauses.`);
    assert.deepEqual(clauses, xiang.clauses, `Lesson ${id} should render all of its Image clause explanations.`);
    if (id === 8) assert.match(clauses[1].text, /^先王/, 'Bi should preserve the former-kings subject.');
    if (id === 23) assert.match(clauses[1].text, /^上以/, 'Bo should preserve the ruler subject.');
    const xiangScope = await page.locator('.xiang-reading').textContent();
    assert.match(xiangScope, /大象/, 'Image reading should identify its whole-hexagram scope.');
    assert.match(xiangScope, /小象/, 'Image reading should distinguish line-image commentary.');
    await page.locator('.hexagram-commentary').getByRole('heading', { name: '卦意解读', exact: true }).waitFor();
    const reading = await page.locator('.hexagram-commentary .reading-paragraph').allTextContents();
    assert.deepEqual(reading, lesson.reading, `Lesson ${id} should retain its reading paragraphs.`);
  };
  await assertCommentary(1);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '/tmp/guanyi-xiang-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await assertNoOverflow('Mobile daily lesson');
  await page.screenshot({ path: '/tmp/guanyi-xiang-mobile.png', fullPage: true });

  // Keyboard navigation remains usable in the narrow layout.
  await nav('六十四卦').focus();
  await page.keyboard.press('Enter');
  await page.locator('.hexagram-card').nth(63).waitFor();
  assert.equal(await page.locator('.hexagram-card').count(), 64);
  await assertNoOverflow('Mobile catalog');
  const longNote = `${'观察、行动与反思，一步一步，把今天的学习放进生活。'.repeat(50)}${'LongUnbrokenText'.repeat(35)}`;
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of [2, 8, 10, 23, 64]) {
      await nav('六十四卦').click();
      await page.getByRole('button', { name: `第${id}卦 ${lessons[id - 1].title}`, exact: true }).click();
      await assertLesson(id);
      await assertCommentary(id);
      for (const step of ['卦辞', '卦解', '联系生活', '温故小测']) {
        await tab(step).click();
        if (id === 2 && step === '联系生活') {
          await page.locator('#reflection-note').fill(longNote);
          assert.equal(await page.locator('#reflection-note').inputValue(), longNote);
        }
        await assertNoOverflow(`Mobile ${width}px lesson ${id}, ${step}`);
      }
    }
  }
  await nav('学习方法').click();
  await page.locator('.method-card').nth(3).waitFor();
  await assertNoOverflow('Mobile learning methods');
  await nav('学习记录').click();
  await page.getByRole('heading', { name: '第一步，就从今天开始。' }).waitFor();
  await assertNoOverflow('Mobile history');
  console.log('PASS: judgment/Image originals, translations and clause explanations, plus mobile 320/390 px learning without overflow.');

  await page.setViewportSize({ width: 1440, height: 1050 });
  await nav('六十四卦').click();
  await page.locator('.hexagram-card').nth(63).waitFor();
  assert.equal(await page.locator('.hexagram-card').count(), 64);
  const search = page.getByRole('searchbox', { name: '搜索卦名、序号或主题' });
  await search.fill('乾');
  await page.getByRole('button', { name: `第1卦 ${lessons[0].title}`, exact: true }).waitFor();
  assert.equal(await page.locator('.hexagram-card').count(), 1);
  await search.fill('不存在的卦名');
  await page.getByRole('heading', { name: '这里还没有匹配的课程' }).waitFor();
  assert.equal(await page.locator('.hexagram-card').count(), 0);
  await page.getByRole('button', { name: '显示全部课程', exact: true }).click();
  await page.getByRole('button', { name: '已学 0', exact: true }).click();
  await page.getByRole('heading', { name: '这里还没有匹配的课程' }).waitFor();
  assert.equal(await page.locator('.hexagram-card').count(), 0);
  await page.getByRole('button', { name: '显示全部课程', exact: true }).click();
  await page.locator('.hexagram-card').nth(63).waitFor();
  console.log('PASS: 64-course catalog, search, no matches, and empty completed filter.');

  await nav('今日学习').click();
  await assertLesson(1);
  await tab('卦辞').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tab('卦解').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'step-1');
  await page.keyboard.press('End');
  assert.equal(await tab('温故小测').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await tab('卦辞').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await tab('温故小测').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('.step-tab[tabindex="0"]').count(), 1);

  await tab('联系生活').click();
  const note = '今天先用十五分钟开始学习，再观察自己的节奏。';
  await page.getByLabel('留下一点思考', { exact: false }).fill(note);
  await page.waitForFunction(({ key, text }) => JSON.parse(localStorage.getItem(key)).notes['1'] === text, {
    key: STORAGE_KEY, text: note,
  });
  await page.reload({ waitUntil: 'networkidle' });
  await assertLesson(1);
  await tab('联系生活').click();
  assert.equal(await page.locator('#reflection-note').inputValue(), note);
  assert.equal((await storage()).notes['1'], note);

  await tab('温故小测').click();
  const complete = page.getByRole('button', { name: '完成今日学习', exact: true });
  assert(await complete.isDisabled(), 'An unanswered quiz must block completion.');
  assert(await page.getByRole('button', { name: '检验理解', exact: true }).isDisabled());
  const firstQuiz = lessons[0].quiz;
  await page.getByRole('radio').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('radio').nth(1).getAttribute('aria-checked'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'quiz-option-1');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('radio').first().getAttribute('aria-checked'), 'true');
  await page.keyboard.press('End');
  assert.equal(await page.getByRole('radio').last().getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await page.getByRole('radio').first().getAttribute('aria-checked'), 'true');
  assert.equal(await page.locator('.quiz-option[tabindex="0"]').count(), 1);
  assert(await complete.isDisabled(), 'Selecting an answer without checking it must still block completion.');
  await page.getByRole('radio').nth((firstQuiz.answer + 1) % firstQuiz.options.length).click();
  await page.getByRole('button', { name: '检验理解', exact: true }).click();
  await page.locator('.quiz-feedback.error').waitFor();
  assert(await complete.isDisabled(), 'A wrong answer must block completion.');
  assert.equal(Object.keys((await storage()).completed).length, 0);
  await page.getByRole('radio').nth(firstQuiz.answer).click();
  await page.getByRole('button', { name: '检验理解', exact: true }).click();
  await page.locator('.quiz-feedback.success').waitFor();
  assert(!(await complete.isDisabled()), 'The correct checked answer should enable completion.');
  await complete.click();
  await page.locator('.complete-panel').waitFor();
  await waitForStoredCount(1);
  await assertLesson(1);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '1');
  assert.equal(Object.keys((await storage()).completed).length, 1);

  await nav('学习记录').click();
  await page.locator('.history-item').waitFor();
  assert.equal(await page.locator('.history-item').count(), 1);
  assert.equal(await page.locator('.history-note').textContent(), note);
  assert.match(await page.locator('.stat-value').first().textContent(), /^1\s*卦/);
  console.log('PASS: keyboard tab/radio navigation, note persistence, quiz feedback, completion gating, and history.');

  const secondPage = await context.newPage();
  observeErrors(secondPage);
  await secondPage.goto(APP_URL, { waitUntil: 'networkidle' });
  const syncedNote = `${note}（跨标签页更新）`;
  await secondPage.evaluate(({ key, text }) => {
    const progress = JSON.parse(localStorage.getItem(key));
    progress.notes['1'] = text;
    localStorage.setItem(key, JSON.stringify(progress));
  }, { key: STORAGE_KEY, text: syncedNote });
  await page.waitForFunction(text => document.querySelector('.history-note')?.textContent === text, syncedNote);
  await secondPage.evaluate(({ key, text }) => {
    const progress = JSON.parse(localStorage.getItem(key));
    progress.notes['1'] = text;
    localStorage.setItem(key, JSON.stringify(progress));
  }, { key: STORAGE_KEY, text: note });
  await page.waitForFunction(text => document.querySelector('.history-note')?.textContent === text, note);
  await secondPage.close();
  console.log('PASS: progress updates from a second browser tab are reflected live.');

  await nav('六十四卦').click();
  await page.getByRole('button', { name: `第2卦 ${lessons[1].title}`, exact: true }).click();
  await assertLesson(2);
  await page.locator('.viewing-banner').waitFor();
  await tab('温故小测').click();
  assert.equal(await page.getByRole('button', { name: '完成今日学习', exact: true }).count(), 0);
  await page.getByRole('radio').nth(lessons[1].quiz.answer).click();
  await page.getByRole('button', { name: '检验理解', exact: true }).click();
  await page.locator('.quiz-feedback.success').waitFor();
  assert.equal(Object.keys((await storage()).completed).length, 1);
  await nav('今日学习').click();
  await assertLesson(1);
  await page.reload({ waitUntil: 'networkidle' });
  await assertLesson(1);
  console.log('PASS: same-day lesson stays fixed and future previews cannot change completion.');

  await page.evaluate(key => {
    const progress = JSON.parse(localStorage.getItem(key));
    const now = new Date();
    const previousDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const yesterday = `${previousDay.getFullYear()}-${String(previousDay.getMonth() + 1).padStart(2, '0')}-${String(previousDay.getDate()).padStart(2, '0')}`;
    progress.startedOn = yesterday;
    progress.completed['1'] = yesterday;
    localStorage.setItem(key, JSON.stringify(progress));
  }, STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await assertLesson(2);
  await tab('温故小测').click();
  await page.getByRole('radio').nth(lessons[1].quiz.answer).click();
  await page.getByRole('button', { name: '检验理解', exact: true }).click();
  await page.getByRole('button', { name: '完成今日学习', exact: true }).click();
  await page.locator('.complete-panel').waitFor();
  await waitForStoredCount(2);
  await assertLesson(2);
  assert.equal(Object.keys((await storage()).completed).length, 2);
  assert.equal((await storage()).notes['1'], note);
  assert.match(await page.locator('.streak-badge').textContent(), /连续学习 2 天/);
  console.log('PASS: after a calendar-day change, the next sequential lesson completes and streak advances.');

  await page.setViewportSize({ width: 390, height: 844 });
  await nav('学习记录').click();
  await page.locator('.history-item').nth(1).waitFor();
  assert.equal(await page.locator('.history-note').first().textContent(), longNote);
  await assertNoOverflow('Mobile history with long multiline and unbroken notes');
  await page.setViewportSize({ width: 1440, height: 1050 });

  await page.evaluate(key => localStorage.setItem(key, '{broken JSON'), STORAGE_KEY);
  await page.reload({ waitUntil: 'networkidle' });
  await assertLesson(1);
  await waitForStoredCount(0);
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  assert.deepEqual((await storage()).completed, {});
  assert.deepEqual((await storage()).notes, {});
  console.log('PASS: corrupt browser storage resets safely.');

  const legacyContext = await browser.newContext({ timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce' });
  const legacyNote = '升级前保存的思考：先理解处境，再采取行动。';
  await legacyContext.addInitScript(({ key, note }) => {
    if (localStorage.getItem(key) !== null) return;
    const now = new Date();
    const previousDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    const yesterday = `${previousDay.getFullYear()}-${String(previousDay.getMonth() + 1).padStart(2, '0')}-${String(previousDay.getDate()).padStart(2, '0')}`;
    localStorage.setItem(key, JSON.stringify({
      version: 1, startedOn: yesterday, completed: { '1': yesterday }, notes: { '1': note },
    }));
  }, { key: STORAGE_KEY, note: legacyNote });
  const legacyPage = await legacyContext.newPage();
  observeErrors(legacyPage);
  await legacyPage.goto(APP_URL, { waitUntil: 'networkidle' });
  assert.equal(await legacyPage.locator('.lesson-number').textContent(), '第 02 卦');
  assert.equal(await legacyPage.getByRole('progressbar').getAttribute('aria-valuenow'), '1');
  await legacyPage.getByRole('button', { name: '继续：卦解', exact: true }).click();
  await legacyPage.getByRole('heading', { name: '卦象解读', exact: true }).waitFor();
  await legacyPage.waitForFunction(() => {
    const heading = document.getElementById('study-title')?.getBoundingClientRect();
    return heading && heading.top >= 0 && heading.bottom <= window.innerHeight;
  });
  await legacyPage.locator('.nav-list').getByRole('button', { name: /学习记录/ }).click();
  assert.equal(await legacyPage.locator('.history-note').textContent(), legacyNote);
  await legacyPage.getByRole('button', { name: `回顾${lessons[0].title}`, exact: true }).click();
  await legacyPage.getByRole('tab', { name: /联系生活/ }).click();
  assert.equal(await legacyPage.locator('#reflection-note').inputValue(), legacyNote);
  await legacyPage.reload({ waitUntil: 'networkidle' });
  const retained = await legacyPage.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  assert.equal(retained.version, 1);
  assert.equal(retained.notes['1'], legacyNote);
  assert.equal(Object.keys(retained.completed).length, 1);
  assert.deepEqual(Object.keys(retained).sort(), ['completed', 'notes', 'startedOn', 'version']);
  await legacyContext.close();
  console.log('PASS: existing version-1 completion and notes remain intact with the unchanged storage schema.');

  const blockedContext = await browser.newContext({ timezoneId: 'Asia/Shanghai' });
  await blockedContext.addInitScript(() => {
    Object.defineProperty(Storage.prototype, 'setItem', {
      value() { throw new Error('Storage writes blocked for this test'); },
    });
  });
  const blockedPage = await blockedContext.newPage();
  observeErrors(blockedPage);
  await blockedPage.goto(APP_URL, { waitUntil: 'networkidle' });
  await blockedPage.getByRole('alert').waitFor();
  assert.match(await blockedPage.getByRole('alert').textContent(), /浏览器暂时无法保存数据/);
  await blockedPage.getByRole('tab', { name: /联系生活/ }).click();
  await blockedPage.locator('#reflection-note').fill('存储不可用时仍可学习');
  assert.equal(await blockedPage.locator('#reflection-note').inputValue(), '存储不可用时仍可学习');
  await blockedPage.getByRole('tab', { name: /温故小测/ }).click();
  await blockedPage.getByRole('radio').nth(firstQuiz.answer).click();
  await blockedPage.getByRole('button', { name: '检验理解', exact: true }).click();
  await blockedPage.getByRole('button', { name: '完成今日学习', exact: true }).click();
  await blockedPage.locator('.complete-panel').waitFor();
  assert.equal(await blockedPage.getByRole('progressbar').getAttribute('aria-valuenow'), '1');
  await blockedPage.reload({ waitUntil: 'networkidle' });
  await blockedPage.getByRole('alert').waitFor();
  assert.equal(await blockedPage.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
  await blockedContext.close();
  console.log('PASS: unavailable localStorage shows a notice while learning and in-memory progress remain usable.');

  assert.deepEqual(failures, [], `Browser errors detected:\n${failures.join('\n')}`);
  console.log('Browser integration checks passed. Screenshots: /tmp/guanyi-xiang-desktop.png and /tmp/guanyi-xiang-mobile.png');
} finally {
  await browser.close();
}
