// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GistDialog } from '../src/client/gist-dialog.ts'
import { saveGithubToken } from '../src/client/gist.ts'

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() { return entries.size },
    clear: () => entries.clear(),
    getItem: key => entries.get(key) ?? null,
    key: index => Array.from(entries.keys())[index] ?? null,
    removeItem: key => { entries.delete(key) },
    setItem: (key, value) => { entries.set(key, value) },
  }
}

describe('GistDialog 组件', () => {
  const originalFetch = globalThis.fetch
  let memoryStorage: Storage

  beforeEach(() => {
    vi.restoreAllMocks()
    memoryStorage = createMemoryStorage()
    Object.defineProperty(window, 'localStorage', {
      value: memoryStorage,
      configurable: true,
      writable: true,
    })
    document.body.innerHTML = ''
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('初次打开时若无 Token 展示 Token 输入框并引导配置', () => {
    const dialog = new GistDialog(document, {
      getLocale: () => 'zh',
    })

    dialog.open()
    expect(dialog.element.open).toBe(true)
    const tokenInput = dialog.element.querySelector('[data-dsh-gist-token-input]') as HTMLInputElement
    expect(tokenInput).toBeTruthy()

    dialog.destroy()
  })

  it('保存 Token 后更新 UI 并加载 Gist 列表', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'test_gist_1',
          description: '[DSH Share] 测试 Gist 1',
          html_url: 'https://gist.github.com/user/test_gist_1',
          created_at: '2026-11-07T00:00:00Z',
          files: { 'dsh-test.md': { filename: 'dsh-test.md' } },
        },
      ],
    }) as unknown as Response)

    const dialog = new GistDialog(document, {
      getLocale: () => 'zh',
    })

    const tokenInput = dialog.element.querySelector('[data-dsh-gist-token-input]') as HTMLInputElement
    const saveBtn = dialog.element.querySelector('[data-dsh-gist-save-token]') as HTMLButtonElement

    tokenInput.value = 'ghp_new_token_1234'
    saveBtn.click()

    expect(dialog.token).toBe('ghp_new_token_1234')
    expect(window.localStorage.getItem('dsh-share.github-token')).toBe('ghp_new_token_1234')

    // 等待异步列表加载完成
    await vi.waitFor(() => {
      const item = dialog.element.querySelector('[data-gist-id="test_gist_1"]')
      expect(item).toBeTruthy()
      expect(item?.textContent).toContain('测试 Gist 1')
    })

    dialog.destroy()
  })

  it('支持直接 prependGist 即时呈现新分享的 Gist', () => {
    const dialog = new GistDialog(document, {
      getLocale: () => 'zh',
    })

    dialog.prependGist({
      id: 'new_shared_gist',
      description: '[DSH Share] 刚分享的对话',
      title: '刚分享的对话',
      htmlUrl: 'https://gist.github.com/user/new_shared_gist',
      createdAt: '2026-11-07T01:00:00Z',
      fileName: 'dsh-instant.md',
    })

    const item = dialog.element.querySelector('[data-gist-id="new_shared_gist"]')
    expect(item).toBeTruthy()
    expect(item?.textContent).toContain('刚分享的对话')
    expect(item?.textContent).toContain('dsh-instant.md')

    dialog.destroy()
  })

  it('点击刷新强制调用 GitHub API 重新获取网页真实列表', async () => {
    saveGithubToken(window.localStorage, 'ghp_saved_token')

    let fetchCount = 0
    globalThis.fetch = vi.fn(async () => {
      fetchCount++
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: `gist_turn_${fetchCount}`,
            description: `[DSH Share] 第 ${fetchCount} 次列表`,
            html_url: `https://gist.github.com/user/gist_turn_${fetchCount}`,
            created_at: '2026-11-07T00:00:00Z',
            files: { 'dsh-refresh.md': { filename: 'dsh-refresh.md' } },
          },
        ],
      } as unknown as Response
    })

    const dialog = new GistDialog(document, {
      getLocale: () => 'zh',
    })

    dialog.open()
    await vi.waitFor(() => {
      expect(dialog.element.querySelector('[data-gist-id="gist_turn_1"]')).toBeTruthy()
    })

    // 点击刷新按钮
    const refreshBtn = dialog.element.querySelector('[data-dsh-gist-refresh]') as HTMLButtonElement
    refreshBtn.click()

    await vi.waitFor(() => {
      expect(dialog.element.querySelector('[data-gist-id="gist_turn_2"]')).toBeTruthy()
    })
    expect(fetchCount).toBe(2)

    dialog.destroy()
  })

  it('支持在列表中点击彻底删除，经二次确认后从 DOM 中移除', async () => {
    saveGithubToken(window.localStorage, 'ghp_saved_token')

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'DELETE') {
        return { ok: true, status: 204 } as unknown as Response
      }
      return {
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'gist_to_delete',
            description: '[DSH Share] 待删除对话',
            html_url: 'https://gist.github.com/user/gist_to_delete',
            created_at: '2026-11-07T00:00:00Z',
            files: { 'dsh-del.md': { filename: 'dsh-del.md' } },
          },
        ],
      } as unknown as Response
    })

    // Mock confirm
    window.confirm = vi.fn(() => true)

    const dialog = new GistDialog(document, {
      getLocale: () => 'zh',
    })

    dialog.open()

    await vi.waitFor(() => {
      expect(dialog.element.querySelector('[data-gist-id="gist_to_delete"]')).toBeTruthy()
    })

    const deleteBtn = dialog.element.querySelector(
      '[data-gist-id="gist_to_delete"] .dsh-gist-dialog__btn--danger',
    ) as HTMLButtonElement
    expect(deleteBtn).toBeTruthy()
    deleteBtn.click()

    await vi.waitFor(() => {
      expect(dialog.element.querySelector('[data-gist-id="gist_to_delete"]')).toBeNull()
    })

    expect(window.confirm).toHaveBeenCalled()
    dialog.destroy()
  })
})
