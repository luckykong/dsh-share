import { type GistItem } from './gist.ts';
import { type ShareLocale } from './i18n.ts';
export interface GistDialogOptions {
    getLocale(): ShareLocale;
    onTokenChange?(token: string): void;
}
export declare class GistDialog {
    private readonly document;
    private readonly options;
    readonly element: HTMLDialogElement;
    private readonly titleElement;
    private readonly closeButton;
    private readonly tokenInput;
    private readonly saveTokenButton;
    private readonly clearTokenButton;
    private readonly tokenHelp;
    private readonly tokenMask;
    private readonly statusElement;
    private readonly listContainer;
    private readonly refreshButton;
    private readonly storage?;
    private currentToken;
    private loading;
    constructor(document: Document, options: GistDialogOptions);
    get token(): string;
    /** 分享成功后直接追加新创建的 Gist 到顶部，保证即刻可见。 */
    prependGist(item: GistItem): void;
    private updateCopy;
    private updateTokenUI;
    private handleSaveToken;
    private handleClearToken;
    private showStatus;
    open(): void;
    close(): void;
    destroy(): void;
    loadList(): Promise<void>;
    private createItemRow;
    private renderList;
    private handleDelete;
}
//# sourceMappingURL=gist-dialog.d.ts.map