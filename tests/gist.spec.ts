// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearGithubToken,
  createSecretGist,
  deleteGist,
  listSecretGists,
  loadGithubToken,
  saveGithubToken,
} from '../src/client/gist.ts'

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

describe('Gist Token 管理', () => {
  it('保存、读取和清除 GitHub Token', () => {
    const storage = createMemoryStorage()
    expect(loadGithubToken(storage)).toBe('')

    saveGithubToken(storage, ' ghp_test_token_123 ')
    expect(loadGithubToken(storage)).toBe('ghp_test_token_123')

    clearGithubToken(storage)
    expect(loadGithubToken(storage)).toBe('')
  })

  it('传入空 Token 时等同于清除', () => {
    const storage = createMemoryStorage()
    saveGithubToken(storage, 'ghp_token')
    saveGithubToken(storage, '   ')
    expect(loadGithubToken(storage)).toBe('')
  })
})

describe('Gist API 调用', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('创建机密 Gist (public: false) 并包含标识与文件内容', async () => {
    let capturedUrl = ''
    let capturedOptions: RequestInit | undefined

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedOptions = init
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: 'gist_12345',
          description: '[DSH Share] 对话分享测试',
          html_url: 'https://gist.github.com/user/gist_12345',
          created_at: '2026-11-07T00:00:00Z',
        }),
      } as unknown as Response
    })

    const result = await createSecretGist('ghp_my_secret_token', {
      title: '对话分享测试',
      markdown: '# Hello DeepSeek',
    })

    expect(capturedUrl).toBe('https://api.github.com/gists')
    expect(capturedOptions?.method).toBe('POST')
    const headers = capturedOptions?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer ghp_my_secret_token')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')

    const body = JSON.parse(String(capturedOptions?.body))
    expect(body.public).toBe(false)
    expect(body.description).toContain('[DSH Share]')
    expect(body.description).toContain('对话分享测试')
    const files = Object.keys(body.files)
    expect(files[0]).toMatch(/^dsh-.*\.md$/)
    expect(body.files[files[0]!].content).toBe('# Hello DeepSeek')

    expect(result.id).toBe('gist_12345')
    expect(result.htmlUrl).toBe('https://gist.github.com/user/gist_12345')
    expect(result.title).toBe('对话分享测试')
  })

  it('Token 无效时抛出 Bad credentials 明确异常', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Bad credentials' }),
    }) as unknown as Response)

    await expect(createSecretGist('invalid_token', {
      title: '测试',
      markdown: 'content',
    })).rejects.toThrow(/Bad credentials/)
  })

  it('列表获取并正确过滤出 DSH 相关的 Secret Gists', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: 'gist_dsh_1',
          description: '[DSH Share] 会话 A',
          html_url: 'https://gist.github.com/user/gist_dsh_1',
          created_at: '2026-11-06T10:00:00Z',
          files: { 'dsh-session-a.md': { filename: 'dsh-session-a.md' } },
        },
        {
          id: 'gist_other',
          description: 'My ordinary private note',
          html_url: 'https://gist.github.com/user/gist_other',
          created_at: '2026-11-06T11:00:00Z',
          files: { 'note.txt': { filename: 'note.txt' } },
        },
        {
          id: 'gist_dsh_2',
          description: null,
          html_url: 'https://gist.github.com/user/gist_dsh_2',
          created_at: '2026-11-06T12:00:00Z',
          files: { 'dsh-20261106-120000.md': { filename: 'dsh-20261106-120000.md' } },
        },
      ],
    }) as unknown as Response)

    const list = await listSecretGists('ghp_token')
    expect(list.length).toBe(2)
    expect(list[0]?.id).toBe('gist_dsh_1')
    expect(list[0]?.title).toBe('会话 A')
    expect(list[1]?.id).toBe('gist_dsh_2')
  })

  it('彻底删除 Gist 发送 DELETE 请求并在 204 或 404 时成功解析', async () => {
    let capturedUrl = ''
    let capturedMethod = ''

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedMethod = init?.method ?? ''
      return {
        ok: true,
        status: 204,
      } as unknown as Response
    })

    await deleteGist('ghp_token', 'gist_to_delete')
    expect(capturedUrl).toBe('https://api.github.com/gists/gist_to_delete')
    expect(capturedMethod).toBe('DELETE')

    // 404 也视为已删除成功
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
    }) as unknown as Response)

    await expect(deleteGist('ghp_token', 'already_deleted')).resolves.toBeUndefined()
  })
})
