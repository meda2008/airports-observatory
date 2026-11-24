'use strict';
// Read-only expansion of a previously observed, visible publisher list.
async function expandVisibleList(page, action, entryUrl) {
  if (!action) return null;
  if (action.kind !== 'visible_list_expansion' || action.text !== '显示更多') throw Error('Unsupported discovery expansion');
  const expected = new URL(entryUrl);
  const current = new URL(page.url());
  if (current.origin !== expected.origin || current.pathname !== expected.pathname) throw Error('Discovery expansion origin changed');
  const locator = page.getByText(action.text, { exact: true });
  if (await locator.count() !== 1 || !await locator.isVisible()) throw Error('Discovery expansion must be uniquely visible');
  const safe = await locator.evaluate(el => el.tagName === 'BUTTON' && el.type === 'button' && !el.closest('form,a[href]') && !/同意|条款|验证|注册|登录/.test(el.innerText));
  if (!safe) throw Error('Discovery expansion is not a readonly list control');
  const beforeUrl = page.url();
  await locator.click({ timeout: 5000 });
  if (page.url() !== beforeUrl) throw Error('Discovery expansion unexpectedly navigated');
  return { kind: action.kind, text: action.text, beforeUrl, afterUrl: page.url(), observedAt: new Date().toISOString(), clicked: true };
}
module.exports = { expandVisibleList };
