export declare const GITHUB_TOKEN_STORAGE_KEY = "dsh-share.github-token";
export declare const GIST_MARKER = "[DSH Share]";
export interface GistItem {
    id: string;
    description: string;
    title: string;
    htmlUrl: string;
    createdAt: string;
    fileName: string;
}
export interface CreateGistOptions {
    title?: string;
    markdown: string;
    signal?: AbortSignal;
}
export declare function loadGithubToken(storage?: Storage): string;
export declare function saveGithubToken(storage: Storage | undefined, token: string): void;
export declare function clearGithubToken(storage?: Storage): void;
/** 创建机密（Secret）Gist，保存在用户账号名下。 */
export declare function createSecretGist(token: string, options: CreateGistOptions): Promise<GistItem>;
/** 读取当前用户创建的所有由 DSH Share 标识的 Secret Gist 列表。 */
export declare function listSecretGists(token: string, signal?: AbortSignal): Promise<GistItem[]>;
/** 彻底删除一个 Gist。 */
export declare function deleteGist(token: string, gistId: string, signal?: AbortSignal): Promise<void>;
//# sourceMappingURL=gist.d.ts.map