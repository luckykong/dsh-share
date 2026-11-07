import {
  clearGithubToken,
  deleteGist,
  listSecretGists,
  loadGithubToken,
  saveGithubToken,
  type GistItem,
} from './gist.ts'
import { t, type ShareLocale, type Translation } from './i18n.ts'

export interface GistDialogOptions {
  getLocale(): ShareLocale
  onTokenChange?(token: string): void
}

function formatDate(iso: string, locale: ShareLocale): string {
  try {
    const date = new Date(iso)
    return date.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export class GistDialog {
  readonly element: HTMLDialogElement
  private readonly titleElement: HTMLElement
  private readonly closeButton: HTMLButtonElement
  private readonly tokenInput: HTMLInputElement
  private readonly saveTokenButton: HTMLButtonElement
  private readonly clearTokenButton: HTMLButtonElement
  private readonly tokenHelp: HTMLElement
  private readonly tokenMask: HTMLElement
  private readonly statusElement: HTMLElement
  private readonly listContainer: HTMLElement
  private readonly refreshButton: HTMLButtonElement
  private readonly storage?: Storage
  private currentToken = ''
  private loading = false

  constructor(
    private readonly document: Document,
    private readonly options: GistDialogOptions,
  ) {
    let storage: Storage | undefined
    try {
      storage = document.defaultView?.localStorage
    } catch {
      storage = undefined
    }
    this.storage = storage
    this.currentToken = loadGithubToken(storage)

    const dialog = document.createElement('dialog')
    dialog.dataset.dshGistDialog = ''
    dialog.innerHTML = `
      <div class="dsh-gist-dialog__header">
        <span class="dsh-gist-dialog__title" data-dsh-gist-title></span>
        <button class="dsh-gist-dialog__close" data-dsh-gist-close type="button" aria-label="Close">×</button>
      </div>
      <div class="dsh-gist-dialog__body">
        <section class="dsh-gist-dialog__token-box" data-dsh-gist-token-box>
          <div class="dsh-gist-dialog__token-header">
            <label class="dsh-gist-dialog__label" data-dsh-gist-token-label></label>
            <span class="dsh-gist-dialog__token-mask" data-dsh-gist-token-mask hidden></span>
          </div>
          <div class="dsh-gist-dialog__token-input-row">
            <input class="dsh-gist-dialog__input" data-dsh-gist-token-input type="password" spellcheck="false" autocomplete="off" />
            <button class="dsh-gist-dialog__btn dsh-gist-dialog__btn--primary" data-dsh-gist-save-token type="button"></button>
            <button class="dsh-gist-dialog__btn" data-dsh-gist-clear-token type="button" hidden></button>
          </div>
          <p class="dsh-gist-dialog__help" data-dsh-gist-token-help></p>
        </section>

        <div class="dsh-gist-dialog__list-header">
          <span class="dsh-gist-dialog__list-title" data-dsh-gist-list-title></span>
          <button class="dsh-gist-dialog__btn dsh-gist-dialog__btn--sm" data-dsh-gist-refresh type="button"></button>
        </div>
        <div class="dsh-gist-dialog__status" data-dsh-gist-status role="status"></div>
        <div class="dsh-gist-dialog__list" data-dsh-gist-list></div>
      </div>
    `

    this.element = dialog
    this.titleElement = dialog.querySelector('[data-dsh-gist-title]') as HTMLElement
    this.closeButton = dialog.querySelector('[data-dsh-gist-close]') as HTMLButtonElement
    this.tokenInput = dialog.querySelector('[data-dsh-gist-token-input]') as HTMLInputElement
    this.saveTokenButton = dialog.querySelector('[data-dsh-gist-save-token]') as HTMLButtonElement
    this.clearTokenButton = dialog.querySelector('[data-dsh-gist-clear-token]') as HTMLButtonElement
    this.tokenHelp = dialog.querySelector('[data-dsh-gist-token-help]') as HTMLElement
    this.tokenMask = dialog.querySelector('[data-dsh-gist-token-mask]') as HTMLElement
    this.statusElement = dialog.querySelector('[data-dsh-gist-status]') as HTMLElement
    this.listContainer = dialog.querySelector('[data-dsh-gist-list]') as HTMLElement
    this.refreshButton = dialog.querySelector('[data-dsh-gist-refresh]') as HTMLButtonElement

    this.closeButton.addEventListener('click', () => this.close())
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) this.close()
    })

    this.saveTokenButton.addEventListener('click', () => this.handleSaveToken())
    this.clearTokenButton.addEventListener('click', () => this.handleClearToken())
    this.refreshButton.addEventListener('click', () => void this.loadList())

    this.updateCopy()
    this.updateTokenUI()
    document.body.append(dialog)
  }

  get token(): string {
    return this.currentToken
  }

  /** 分享成功后直接追加新创建的 Gist 到顶部，保证即刻可见。 */
  prependGist(item: GistItem): void {
    const emptyNotice = this.listContainer.querySelector('.dsh-gist-dialog__empty')
    if (emptyNotice) {
      this.listContainer.innerHTML = ''
    }
    // 避免重复追加
    if (this.listContainer.querySelector(`[data-gist-id="${item.id}"]`)) return
    const row = this.createItemRow(item)
    this.listContainer.prepend(row)
  }

  private updateCopy(): Translation {
    const strings = t(this.options.getLocale())
    this.titleElement.textContent = strings.gistTitle
    const tokenLabel = this.element.querySelector('[data-dsh-gist-token-label]') as HTMLElement
    if (tokenLabel) tokenLabel.textContent = strings.gistTokenLabel
    this.tokenInput.placeholder = strings.gistTokenPlaceholder
    this.saveTokenButton.textContent = this.currentToken ? strings.gistChangeToken : strings.gistSaveToken
    this.clearTokenButton.textContent = strings.gistClearToken
    this.tokenHelp.textContent = strings.gistTokenHelp
    const listTitle = this.element.querySelector('[data-dsh-gist-list-title]') as HTMLElement
    if (listTitle) listTitle.textContent = strings.manageGists
    this.refreshButton.textContent = this.options.getLocale() === 'zh' ? '刷新' : 'Refresh'
    return strings
  }

  private updateTokenUI(): void {
    const strings = t(this.options.getLocale())
    if (this.currentToken) {
      const masked = `${this.currentToken.slice(0, 4)}••••${this.currentToken.slice(-4)}`
      this.tokenMask.textContent = masked
      this.tokenMask.hidden = false
      this.clearTokenButton.hidden = false
      this.saveTokenButton.textContent = strings.gistChangeToken
    } else {
      this.tokenMask.hidden = true
      this.clearTokenButton.hidden = true
      this.saveTokenButton.textContent = strings.gistSaveToken
    }
  }

  private handleSaveToken(): void {
    const value = this.tokenInput.value.trim()
    if (!value) return
    this.currentToken = value
    saveGithubToken(this.storage, value)
    this.tokenInput.value = ''
    this.updateTokenUI()
    this.options.onTokenChange?.(this.currentToken)
    this.showStatus(this.options.getLocale() === 'zh' ? 'Token 已保存！' : 'Token saved!')
    void this.loadList()
  }

  private handleClearToken(): void {
    this.currentToken = ''
    clearGithubToken(this.storage)
    this.tokenInput.value = ''
    this.updateTokenUI()
    this.options.onTokenChange?.('')
    this.listContainer.innerHTML = ''
    this.showStatus(this.options.getLocale() === 'zh' ? 'Token 已清除' : 'Token cleared')
  }

  private showStatus(message: string): void {
    this.statusElement.textContent = message
    if (message) {
      this.document.defaultView?.setTimeout(() => {
        if (this.statusElement.textContent === message) {
          this.statusElement.textContent = ''
        }
      }, 4000)
    }
  }

  open(): void {
    this.updateCopy()
    this.updateTokenUI()
    if (!this.element.open) {
      if (typeof this.element.showModal === 'function') this.element.showModal()
      else this.element.setAttribute('open', '')
    }
    if (this.currentToken) {
      void this.loadList()
    } else {
      this.tokenInput.focus()
    }
  }

  close(): void {
    if (typeof this.element.close === 'function') this.element.close()
    else this.element.removeAttribute('open')
  }

  destroy(): void {
    this.element.remove()
  }

  async loadList(): Promise<void> {
    if (!this.currentToken) {
      this.listContainer.innerHTML = `<div class="dsh-gist-dialog__empty">${this.tokenHelp.textContent}</div>`
      return
    }
    if (this.loading) return
    this.loading = true
    this.refreshButton.disabled = true
    const strings = t(this.options.getLocale())
    this.listContainer.innerHTML = `<div class="dsh-gist-dialog__loading">${strings.gistLoading}</div>`

    try {
      const items = await listSecretGists(this.currentToken)
      this.renderList(items)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.listContainer.innerHTML = `<div class="dsh-gist-dialog__error">${message}</div>`
    } finally {
      this.loading = false
      this.refreshButton.disabled = false
    }
  }

  private createItemRow(item: GistItem): HTMLElement {
    const strings = t(this.options.getLocale())
    const row = this.document.createElement('div')
    row.className = 'dsh-gist-dialog__item'
    row.dataset.gistId = item.id

    const info = this.document.createElement('div')
    info.className = 'dsh-gist-dialog__item-info'

    const titleLine = this.document.createElement('div')
    titleLine.className = 'dsh-gist-dialog__item-title'
    titleLine.textContent = item.title

    const metaLine = this.document.createElement('div')
    metaLine.className = 'dsh-gist-dialog__item-meta'
    metaLine.textContent = `${formatDate(item.createdAt, this.options.getLocale())} · ${item.fileName}`

    info.append(titleLine, metaLine)

    const actions = this.document.createElement('div')
    actions.className = 'dsh-gist-dialog__item-actions'

    // 打开链接
    const openBtn = this.document.createElement('a')
    openBtn.className = 'dsh-gist-dialog__action-link'
    openBtn.href = item.htmlUrl
    openBtn.target = '_blank'
    openBtn.rel = 'noreferrer noopener'
    openBtn.textContent = strings.gistOpen

    // 复制链接
    const copyBtn = this.document.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'dsh-gist-dialog__btn dsh-gist-dialog__btn--sm'
    copyBtn.textContent = strings.gistCopyLink
    copyBtn.addEventListener('click', async () => {
      try {
        await this.document.defaultView?.navigator.clipboard?.writeText(item.htmlUrl)
        this.showStatus(strings.gistLinkCopied)
      } catch {
        this.showStatus(item.htmlUrl)
      }
    })

    // 彻底删除（二次确认弹窗）
    const deleteBtn = this.document.createElement('button')
    deleteBtn.type = 'button'
    deleteBtn.className = 'dsh-gist-dialog__btn dsh-gist-dialog__btn--sm dsh-gist-dialog__btn--danger'
    deleteBtn.textContent = strings.gistDelete
    deleteBtn.addEventListener('click', () => void this.handleDelete(item, row, deleteBtn))

    actions.append(openBtn, copyBtn, deleteBtn)
    row.append(info, actions)
    return row
  }

  private renderList(items: GistItem[]): void {
    const strings = t(this.options.getLocale())
    if (items.length === 0) {
      this.listContainer.innerHTML = `<div class="dsh-gist-dialog__empty">${strings.gistEmpty}</div>`
      return
    }

    this.listContainer.innerHTML = ''
    for (const item of items) {
      this.listContainer.append(this.createItemRow(item))
    }
  }

  private async handleDelete(
    item: GistItem,
    row: HTMLElement,
    btn: HTMLButtonElement,
  ): Promise<void> {
    const strings = t(this.options.getLocale())
    const confirmDelete = this.document.defaultView?.confirm
    if (confirmDelete && !confirmDelete(strings.gistDeleteConfirm(item.title))) {
      return
    }

    btn.disabled = true
    btn.textContent = strings.gistDeleting

    try {
      await deleteGist(this.currentToken, item.id)
      row.remove()
      this.showStatus(strings.gistDeleted)
      if (this.listContainer.children.length === 0) {
        this.listContainer.innerHTML = `<div class="dsh-gist-dialog__empty">${strings.gistEmpty}</div>`
      }
    } catch (error) {
      btn.disabled = false
      btn.textContent = strings.gistDelete
      const message = error instanceof Error ? error.message : String(error)
      this.showStatus(`${strings.gistDelete}失败: ${message}`)
    }
  }
}
