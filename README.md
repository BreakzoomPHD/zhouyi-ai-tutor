# 观易 · 每日一卦

一个中文《周易》入门学习网站。按通行本六十四卦的顺序，每天读一卦，用原文、白话导读、生活练习和小测验帮助理解。

## 已实现

- 完整六十四卦目录：卦辞原文、完整白话译文、关键词释义、上下卦图、卦象解读、卦意解读、两道自省问题和一道理解测验。
- 每日学习：首次从乾卦开始；通过小测并点击完成后，当天保持当前课程，次日本地日期进入下一卦。
- 漏学后从下一卦继续，不按经过的天数跳课。预习和回顾不限次数，每天只新增一卦完成记录。
- 学习笔记自动保存在当前浏览器；学习记录展示已读课程、连续学习天数与笔记。
- 卦名、拼音、序号、主题搜索；已学／未学筛选；适配手机。

初版采用固定课程内容，不需要 API 密钥。尚未接入生成式 AI、账号同步、消息推送或日历提醒。这里的「每日」指打开网站时，根据浏览器的本地日期安排课程。

## 本地开发

需要 Node.js 22.12 以上版本（云环境使用 Node.js 24）和 npm。

```bash
npm ci
npm run dev
```

开发服务器默认端口为 5173；在浏览器中访问 Vite 输出的地址。云环境中安装时可使用可写缓存：

```bash
cd /workspace/zhouyi-ai-tutor
npm ci --cache /workspace/.npm-cache
npm run dev -- --port 5173 --strictPort
```

## 验证

```bash
npm test
npm run build
```

浏览器集成测试需要先启动开发服务器，再安装 Playwright Chromium：

```bash
npx playwright install chromium
npm run test:browser
```

若使用已有的 Chromium，可通过 `CHROMIUM_PATH` 指定可执行文件；`APP_URL` 可指定测试服务地址：

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

测试覆盖每日顺序、同日锁定、坏数据恢复、日期与连续学习边界，以及真实浏览器中的笔记持久化、答题完成、目录检索、次日推进和手机布局。浏览器测试使用独立的浏览器上下文，不修改你平时浏览器中的记录。

## 构建与部署

`npm run build` 生成 `dist/` 静态文件，可部署到支持静态网站的托管服务。`npm run preview` 用于本地检查生产构建。数据保存在网站对应域名的浏览器 `localStorage` 中：不同设备、浏览器或域名不会共享进度，清除网站数据会删除记录。

### GitHub Pages

仓库内的 `.github/workflows/pages.yml` 会在推送到 `main` 后安装依赖、运行测试、按 Pages 路径构建并发布网站。先在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。需要仓库拥有者或具备相应管理权限的用户完成这项设置。

设置好后，在 **Actions → Deploy to GitHub Pages → Run workflow** 中运行工作流，也可通过向 `main` 推送更新触发部署。成功后的实际网址显示在部署步骤和 `github-pages` 环境中。此仓库的标准网址为 `https://breakzoomphd.github.io/zhouyi-ai-tutor/`；只有部署成功后才能访问。

本地检查仓库路径构建：

```bash
npm run build -- --base=/zhouyi-ai-tutor/
npm run preview -- --base=/zhouyi-ai-tutor/
```

发布云开发环境与部署 GitHub Pages 网站是两件不同的事；前者不会生成公开网站网址。

## 内容与扩展

`src/data/hexagrams.ts` 保存课程原文和学习练习，按通行本《周易》卦序编排；`src/data/commentary.ts` 汇总全部六十四卦的白话译文、关键词和卦象解读。白话译文对照整段卦辞，保留占筮、祭祀、方位等古代语境；「卦解」再解释上下卦的自然意象、卦意与现代生活启发。

卦辞为公版经典原文，采用简体字，版本间可能存在字形、标点差异。译文采用便于入门的常见传统解释，不代表唯一训诂；「贞」本与占问有关，传统义理解释也常作守正。白话译文、卦解、练习和测验为现代入门学习材料，不能替代原典和注疏。初版聚焦卦辞，尚未逐爻展开。学习目标是理解经典、观察处境和自省，不用于预测未来。

`src/lib/progress.ts` 负责独立于界面的日期和进度逻辑；`src/App.tsx` 是应用页面。后续可以加入逐爻阅读、参考注疏、服务端账号与同步，或在服务端接入 AI 对话。API 密钥应留在服务端，不能放入前端构建变量。
