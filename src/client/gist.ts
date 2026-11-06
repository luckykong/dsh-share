import { createDownloadFilename } from './filename.ts'

export const GITHUB_TOKEN_STORAGE_KEY = 'dsh-share.github-token'
export const DELETED_GISTS_STORAGE_KEY = 'dsh-share.deleted-gists'
export const GIST_MARKER = '[DSH Share]'

export interface GistItem {
  id: string
  description: string
  title: string
  htmlUrl: string
  createdAt: string
  fileName: string
}

export interface CreateGistOptions {
  title?: string
  markdown: string
  signal?: AbortSignal
}

export function loadDeletedGistIds(storage?: Storage): Set<string> {
  if (!storage) return new Set()
  try {
    const raw = storage.getItem(DELETED_GISTS_STORAGE_KEY)
    if (!raw) return new Set()
    const list = JSON.parse(raw)
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

export function recordDeletedGistId(storage: Storage | undefined, gistId: string): void {
  if (!storage) return
  try {
    const current = loadDeletedGistIds(storage)
    current.add(gistId)
    const array = Array.from(current).slice(-200)
    storage.setItem(DELETED_GISTS_STORAGE_KEY, JSON.stringify(array))
  } catch {
    // 忽略异常
  }
}

export function loadGithubToken(storage?: Storage): string {
  if (!storage) return ''
  try {
    return (storage.getItem(GITHUB_TOKEN_STORAGE_KEY) ?? '').trim()
  } catch {
    return ''
  }
}

export function saveGithubToken(storage: Storage | undefined, token: string): void {
  if (!storage) return
  try {
    const clean = token.trim()
    if (clean) storage.setItem(GITHUB_TOKEN_STORAGE_KEY, clean)
    else storage.removeItem(GITHUB_TOKEN_STORAGE_KEY)
  } catch {
    // 忽略 localStorage 受阻异常
  }
}

export function clearGithubToken(storage?: Storage): void {
  if (!storage) return
  try {
    storage.removeItem(GITHUB_TOKEN_STORAGE_KEY)
  } catch {
    // 忽略异常
  }
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function parseErrorMessage(status: number, data?: { message?: string }): string {
  if (status === 401) return 'Bad credentials (GitHub Token 无效或已过期)'
  if (status === 403) return 'Forbidden (权限不足，请确保 Token 包含 gist 权限)'
  if (status === 404) return 'Not Found (未找到该 Gist)'
  return data?.message ? `GitHub API 错误: ${data.message}` : `HTTP 错误: ${status}`
}

/** 创建机密（Secret）Gist，保存在用户账号名下。 */
export async function createSecretGist(
  token: string,
  options: CreateGistOptions,
): Promise<GistItem> {
  const cleanToken = token.trim()
  if (!cleanToken) throw new Error('Missing GitHub token')
  const fileName = createDownloadFilename('md', options.title)
  const title = (options.title ?? '').trim() || 'Shared conversation'
  const description = `${GIST_MARKER} ${title}`

  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      ...githubHeaders(cleanToken),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description,
      public: false,
      files: {
        [fileName]: {
          content: options.markdown,
        },
      },
    }),
    signal: options.signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => undefined)
    throw new Error(parseErrorMessage(response.status, errorData))
  }

  const result = await response.json()
  return {
    id: result.id,
    description: result.description ?? description,
    title,
    htmlUrl: result.html_url,
    createdAt: result.created_at,
    fileName,
  }
}

/** 读取当前用户创建的所有由 DSH Share 标识的 Secret Gist 列表。 */
export async function listSecretGists(
  token: string,
  signal?: AbortSignal,
): Promise<GistItem[]> {
  const cleanToken = token.trim()
  if (!cleanToken) throw new Error('Missing GitHub token')

  // 加入时间戳并指定 cache: 'no-store'，彻底规避浏览器和网络代理对 GET 请求的缓存
  const url = `https://api.github.com/gists?per_page=100&_t=${Date.now()}`
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      ...githubHeaders(cleanToken),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
    signal,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => undefined)
    throw new Error(parseErrorMessage(response.status, errorData))
  }

  const items = (await response.json()) as Array<{
    id: string
    description?: string | null
    html_url: string
    created_at: string
    files?: Record<string, { filename?: string }>
  }>

  const gists: GistItem[] = []
  for (const item of items) {
    const desc = (item.description ?? '').trim()
    const files = item.files ? Object.keys(item.files) : []
    const isDshGist = desc.includes(GIST_MARKER) || files.some(file => file.startsWith('dsh-'))
    if (!isDshGist) continue

    const title = desc.replace(GIST_MARKER, '').trim() || files[0] || 'Shared conversation'
    gists.push({
      id: item.id,
      description: desc,
      title,
      htmlUrl: item.html_url,
      createdAt: item.created_at,
      fileName: files[0] ?? 'dsh-share.md',
    })
  }

  return gists
}

/** 彻底删除一个 Gist。 */
export async function deleteGist(
  token: string,
  gistId: string,
  signal?: AbortSignal,
): Promise<void> {
  const cleanToken = token.trim()
  if (!cleanToken) throw new Error('Missing GitHub token')

  const response = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
    method: 'DELETE',
    headers: githubHeaders(cleanToken),
    signal,
  })

  // 204 No Content 代表成功删除；若已是 404 也说明远程已不存在
  if (response.status === 204 || response.status === 404) {
    return
  }

  const errorData = await response.json().catch(() => undefined)
  throw new Error(parseErrorMessage(response.status, errorData))
}
