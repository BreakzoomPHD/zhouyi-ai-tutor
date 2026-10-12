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
  assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '0');

  // Read the actual course module so the test does not hard-code an answer.
  const lessons = await page.evaluate(async () => {
    const { hexagrams } = await import('/src/data/hexagrams.ts');
    return hexagrams.map(({ id, title, quiz }) => ({ id, title, quiz }));
  });
  assert.equal(lessons.length, 64);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '/tmp/guanyi-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoOverflow('Mobile daily lesson');
  await page.screenshot({ path: '/tmp/guanyi-mobile.png', fullPage: true });

  // Keyboard navigation remains usable in the narrow layout.
  await nav('六十四卦').focus();
  await page.keyboard.press('Enter');
  await page.locator('.hexagram-card').nth(63).waitFor();
  assert.equal(await page.locator('.hexagram-card').count(), 64);
  await assertNoOverflow('Mobile catalog');
  const longNote = `${'观察、行动与反思，一步一步，把今天的学习放进生活。'.repeat(50)}${'LongUnbrokenText'.repeat(35)}`;
  for (const id of [2, 10]) {
    await nav('六十四卦').click();
    await page.getByRole('button', { name: `第${id}卦 ${lessons[id - 1].title}`, exact: true }).click();
    await assertLesson(id);
    for (const step of ['读原文', '明其意', '联系生活', '温故小测']) {
      await tab(step).click();
      if (id === 2 && step === '联系生活') {
        await page.locator('#reflection-note').fill(longNote);
        assert.equal(await page.locator('#reflection-note').inputValue(), longNote);
      }
      await assertNoOverflow(`Mobile lesson ${id}, ${step}`);
    }
  }
  await nav('学习方法').click();
  await page.locator('.method-card').nth(3).waitFor();
  await assertNoOverflow('Mobile learning methods');
  await nav('学习记录').click();
  await page.getByRole('heading', { name: '第一步，就从今天开始。' }).waitFor();
  await assertNoOverflow('Mobile history');
  console.log('PASS: mobile navigation and all four views have no horizontal overflow.');

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
  await tab('读原文').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await tab('明其意').getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'step-1');
  await page.keyboard.press('End');
  assert.equal(await tab('温故小测').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await tab('读原文').getAttribute('aria-selected'), 'true');
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
  console.log('Browser integration checks passed. Screenshots: /tmp/guanyi-desktop.png and /tmp/guanyi-mobile.png');
} finally {
  await browser.close();
}
