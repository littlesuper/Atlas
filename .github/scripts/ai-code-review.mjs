import fs from 'node:fs/promises';
import process from 'node:process';

const COMMENT_MARKER = '<!-- atlas-ai-code-review -->';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_REVIEW_CHARS = 60000;
const DEFAULT_MAX_COMMENT_CHARS = 60000;

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function asPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function appendSummary(markdown) {
  const summaryPath = env('GITHUB_STEP_SUMMARY');
  if (!summaryPath) {
    console.log(markdown);
    return;
  }

  await fs.appendFile(summaryPath, `${markdown}\n`);
}

async function readTextIfExists(path, maxChars = 12000) {
  try {
    const content = await fs.readFile(path, 'utf8');
    if (content.length <= maxChars) {
      return content;
    }
    return `${content.slice(0, maxChars)}\n\n[内容已截断: ${content.length - maxChars} chars]`;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function loadReviewPrompt() {
  const promptFile = '.github/prompts/ai-code-review.md';
  const fullPrompt = await fs.readFile(promptFile, 'utf8');
  const markerIndex = fullPrompt.indexOf('## 提示词正文');
  const searchStart = markerIndex === -1 ? 0 : markerIndex;
  const firstFence = fullPrompt.indexOf('```', searchStart);
  const secondFence = firstFence === -1 ? -1 : fullPrompt.indexOf('```', firstFence + 3);

  if (firstFence === -1 || secondFence === -1) {
    return fullPrompt.trim();
  }

  return fullPrompt.slice(firstFence + 3, secondFence).trim();
}

function githubApiUrl(path) {
  return `https://api.github.com${path}`;
}

async function githubRequest(path, token, options = {}) {
  const response = await fetch(githubApiUrl(path), {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${options.method || 'GET'} ${path} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function listPullFiles(owner, repo, pullNumber, token) {
  const files = [];
  let page = 1;

  while (true) {
    const batch = await githubRequest(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
      token,
    );
    files.push(...batch);
    if (batch.length < 100) {
      return files;
    }
    page += 1;
  }
}

function isTestFile(filename) {
  return /(^|\/)(__tests__|e2e|tests|test-results)\//.test(filename)
    || /\.(test|spec)\.[cm]?[jt]sx?$/.test(filename)
    || /(^|\/)playwright\.config\.[cm]?[jt]s$/.test(filename);
}

function truncate(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[内容已截断: 原始长度 ${text.length} chars, 保留 ${maxChars} chars]`;
}

function formatChangedFiles(files) {
  if (files.length === 0) {
    return '(没有文件变更)';
  }

  return files
    .map((file) => `- ${file.filename} (${file.status}, +${file.additions}/-${file.deletions})`)
    .join('\n');
}

function formatDiff(files, maxChars) {
  if (files.length === 0) {
    return '(本 PR 未包含此类文件变更)';
  }

  const body = files
    .map((file) => {
      const patch = file.patch || '[No textual patch available; file may be binary or too large.]';
      return [
        `### ${file.filename}`,
        `status: ${file.status}, additions: ${file.additions}, deletions: ${file.deletions}`,
        '```diff',
        patch,
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return truncate(body, maxChars);
}

function buildReviewInput({ prompt, pullRequest, files, claudeMd, maxReviewChars }) {
  const testFiles = files.filter((file) => isTestFile(file.filename));
  const sourceFiles = files.filter((file) => !isTestFile(file.filename));
  const sourceBudget = Math.max(12000, Math.floor(maxReviewChars * 0.7));
  const testBudget = Math.max(8000, maxReviewChars - sourceBudget);
  const requirementSummary = [
    `PR #${pullRequest.number}: ${pullRequest.title}`,
    '',
    pullRequest.body || '(PR 未填写描述)',
    '',
    'Changed files:',
    formatChangedFiles(files),
  ].join('\n');

  return prompt
    .replace('[在这里贴入相关需求摘要]', requirementSummary)
    .replace('[在这里贴入完整代码,包括所有相关文件]', formatDiff(sourceFiles, sourceBudget))
    .replace('[在这里贴入测试代码,如果有]', formatDiff(testFiles, testBudget))
    .replace('[在这里贴入相关的CLAUDE.md内容]', claudeMd || '(仓库中未找到 CLAUDE.md)');
}

async function callClaude({ apiKey, model, reviewInput }) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: reviewInput,
        },
      ],
    }),
  });

  const responseText = await response.text();
  const body = responseText ? JSON.parse(responseText) : {};
  if (!response.ok) {
    throw new Error(`Claude API failed: ${response.status} ${responseText}`);
  }

  return (body.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n\n')
    .trim();
}

function formatComment({ review, model, files, maxChars }) {
  const body = [
    COMMENT_MARKER,
    '# Atlas AI Code Review',
    '',
    '> Week 4 Day 5 辅助审查结果。本周该检查不强制阻断合并；🔴/🟠 问题仍建议由 AI 代码守护人确认后处理。',
    '',
    `- Model: \`${model}\``,
    '- Prompt: `.github/prompts/ai-code-review.md`',
    `- Files reviewed: ${files.length}`,
    '',
    review || '(Claude API 未返回文本内容)',
  ].join('\n');

  return truncate(body, maxChars);
}

async function upsertPullComment({ owner, repo, pullNumber, token, body }) {
  const comments = [];
  let page = 1;

  while (true) {
    const batch = await githubRequest(
      `/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100&page=${page}`,
      token,
    );
    comments.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page += 1;
  }

  const existing = comments.find((comment) => comment.body && comment.body.includes(COMMENT_MARKER));
  if (existing) {
    await githubRequest(`/repos/${owner}/${repo}/issues/comments/${existing.id}`, token, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    return 'updated';
  }

  await githubRequest(`/repos/${owner}/${repo}/issues/${pullNumber}/comments`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  return 'created';
}

async function main() {
  const eventPath = env('GITHUB_EVENT_PATH');
  if (!eventPath) {
    await appendSummary('### Atlas AI Code Review\n\nSkipped: `GITHUB_EVENT_PATH` is not set.');
    return;
  }

  const event = JSON.parse(await fs.readFile(eventPath, 'utf8'));
  const pullRequest = event.pull_request;
  if (!pullRequest) {
    await appendSummary('### Atlas AI Code Review\n\nSkipped: this job only reviews pull requests.');
    return;
  }

  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) {
    await appendSummary([
      '### Atlas AI Code Review',
      '',
      'Skipped: repository secret `ANTHROPIC_API_KEY` is not configured.',
      '',
      'This is expected until the AI code review pilot is connected to a Claude API key.',
    ].join('\n'));
    return;
  }

  const token = env('GITHUB_TOKEN');
  const repository = env('GITHUB_REPOSITORY');
  if (!token || !repository.includes('/')) {
    await appendSummary('### Atlas AI Code Review\n\nSkipped: GitHub token or repository context is missing.');
    return;
  }

  const [owner, repo] = repository.split('/');
  const model = env('AI_REVIEW_MODEL', DEFAULT_MODEL);
  const maxReviewChars = asPositiveInteger(env('AI_REVIEW_MAX_CHARS'), DEFAULT_MAX_REVIEW_CHARS);
  const maxCommentChars = asPositiveInteger(env('AI_REVIEW_MAX_COMMENT_CHARS'), DEFAULT_MAX_COMMENT_CHARS);
  const files = await listPullFiles(owner, repo, pullRequest.number, token);
  const prompt = await loadReviewPrompt();
  const claudeMd = await readTextIfExists('CLAUDE.md');
  const reviewInput = buildReviewInput({
    prompt,
    pullRequest,
    files,
    claudeMd,
    maxReviewChars,
  });
  const review = await callClaude({ apiKey, model, reviewInput });
  const commentBody = formatComment({ review, model, files, maxChars: maxCommentChars });
  const action = await upsertPullComment({
    owner,
    repo,
    pullNumber: pullRequest.number,
    token,
    body: commentBody,
  });

  await appendSummary([
    '### Atlas AI Code Review',
    '',
    `Review comment ${action}.`,
    `Model: \`${model}\``,
    `Files reviewed: ${files.length}`,
  ].join('\n'));
}

main().catch(async (error) => {
  console.error(error);
  await appendSummary([
    '### Atlas AI Code Review',
    '',
    'AI review failed in advisory mode, so this job will not block the PR.',
    '',
    '```text',
    error instanceof Error ? error.message : String(error),
    '```',
  ].join('\n'));
});
