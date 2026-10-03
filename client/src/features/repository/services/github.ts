import { KJUR } from 'jsrsasign';
import { appConfig } from '../../../app/config';
import { repoCache } from './cache';
import { Parser, shouldExcludeFile, shouldIgnoreDirectory } from '../../analysis/services/parser';
import { calcBlast, calcPRRisk, findDependencyChains, findTestImpact } from '../../analysis/services/prImpact';
import { calcHealth } from '../../analysis/services/analysisHealth';

function buildGitHubApiUrl(segments: string[], query?: Record<string,any>): string {
    var path = segments.filter(s => s !== undefined && s !== null && s !== '').map(s => encodeURIComponent(String(s))).join('/');
    var url = 'https://api.github.com/' + path;
    if (!query) return url;
    var params = new URLSearchParams();
    Object.keys(query).forEach(key => {
        var value = query[key];
        if (value === undefined || value === null || value === '') return;
        params.set(key, String(value));
    });
    var qs = params.toString();
    return qs ? url + '?' + qs : url;
}

function buildRepoApiUrl(owner: string, repo: string, segments?: string[], query?: Record<string,any>): string {
    return buildGitHubApiUrl(['repos', owner, repo].concat(segments || []), query);
}

function splitRepoPath(path: string): string[] {
    return (path || '').split('/').filter(Boolean);
}

function decodeBase64Utf8(content: string): string | null {
    var normalized = String(content || '').replace(/\s+/g, '');
    if (!normalized) return null;
    var binary = atob(normalized);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    try {
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        var text = '';
        for (var j = 0; j < bytes.length; j++) text += String.fromCharCode(bytes[j]);
        return text;
    }
}

var GitHub: any = {
    token: null as string | null,
    appId: null as string | null,
    privateKey: null as string | null,
    installationToken: null as string | null,
    installationTokenExpiry: null as number | null,
    rateLimit: { remaining: 60, limit: 60, reset: 0 },
    requestTimeoutMs: 15000,

    generateJWT(): string | null {
        if (!this.appId || !this.privateKey) return null;
        try {
            var now = Math.floor(Date.now() / 1000);
            var payload = { iat: now - 60, exp: now + 600, iss: this.appId };
            var header = { alg: 'RS256', typ: 'JWT' };
            return KJUR.jws.JWS.sign('RS256', JSON.stringify(header), JSON.stringify(payload), this.privateKey);
        } catch (e) {
            console.error('JWT generation failed:', e);
            return null;
        }
    },

    getRepoInstallation(owner: string, repo: string) {
        var jwt = this.generateJWT();
        if (!jwt) return Promise.reject(new Error('Failed to generate JWT'));
        return this.request(buildGitHubApiUrl(['repos', owner, repo, 'installation']), {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'Bearer ' + jwt }
        }, { 401: 'Invalid App credentials', 404: 'GitHub App not installed on this repo' });
    },

    getInstallationToken(installationId: number) {
        var self = this;
        var jwt = this.generateJWT();
        if (!jwt) return Promise.reject(new Error('Failed to generate JWT'));
        return this.request(buildGitHubApiUrl(['app', 'installations', String(installationId), 'access_tokens']), {
            method: 'POST',
            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': 'Bearer ' + jwt }
        }, { 401: 'Invalid App credentials', 404: 'Installation not found' }).then(function (data: any) {
            self.installationToken = data.token;
            self.installationTokenExpiry = new Date(data.expires_at).getTime();
            self.token = data.token;
            return data.token;
        });
    },

    authenticateApp(owner: string, repo: string) {
        var self = this;
        if (this.installationToken && this.installationTokenExpiry && Date.now() < this.installationTokenExpiry - 60000) {
            this.token = this.installationToken;
            return Promise.resolve(this.installationToken);
        }
        return this.getRepoInstallation(owner, repo).then(function (installation: any) {
            if (!installation || !installation.id) throw new Error('No installation found for this repository');
            return self.getInstallationToken(installation.id);
        });
    },

    request(url: string, options?: any, errorMap?: any, retriesLeft?: number) {
        var self = this;
        var method = options && options.method ? options.method.toUpperCase() : 'GET';
        var remainingRetries = typeof retriesLeft === 'number' ? retriesLeft : 2;

        if (method === 'GET') {
            const cached = repoCache.get(url);
            if (cached) return Promise.resolve(cached);
        }

        var h = Object.assign({ 'Accept': 'application/vnd.github.v3+json' }, options && options.headers ? options.headers : {});
        if (this.token && !h.Authorization) h.Authorization = 'Bearer ' + this.token;
        var controller = new AbortController();
        var timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        var requestOptions = Object.assign({}, options || {}, { headers: h, signal: controller.signal });
        return fetch(url, requestOptions).then(function (r) {
            var rem = r.headers.get('x-ratelimit-remaining');
            var lim = r.headers.get('x-ratelimit-limit');
            var rst = r.headers.get('x-ratelimit-reset');
            if (rem !== null) self.rateLimit.remaining = parseInt(rem, 10);
            if (lim !== null) self.rateLimit.limit = parseInt(lim, 10);
            if (rst !== null) self.rateLimit.reset = parseInt(rst, 10);
            if (!r.ok) {
                // Back off and retry on secondary rate limiting instead of failing immediately —
                // a handful of 429s mid-scan shouldn't cascade into dozens of broken file fetches.
                if (r.status === 429 && remainingRetries > 0) {
                    var retryAfter = parseFloat(r.headers.get('retry-after') || '');
                    var waitMs = isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500;
                    clearTimeout(timeoutId);
                    return new Promise(function (resolve) { setTimeout(resolve, Math.min(waitMs, 8000)); })
                        .then(function () { return self.request(url, options, errorMap, remainingRetries - 1); });
                }
                throw new Error(
                    errorMap && errorMap[r.status] ? errorMap[r.status] :
                    r.status === 401 ? 'Invalid token' :
                    r.status === 403 ? 'GitHub request blocked (403)' :
                    r.status === 404 ? 'Repository not found' :
                    r.status === 429 ? 'GitHub throttled (429)' :
                    'Error ' + r.status
                );
            }
            return r.json().then(function(json) {
                if (method === 'GET') {
                    repoCache.set(url, json);
                }
                return json;
            });
        }).catch(function (err: any) {
            if (err && err.name === 'AbortError') throw new Error('GitHub request timed out. Please try again.');
            throw err;
        }).finally(function () { clearTimeout(timeoutId); });
    },

    fetch(url: string, options?: any, errorMap?: any) {
        return this.request(url, options, errorMap);
    },

    getRateLimit() {
        var self = this;
        return this.request(buildGitHubApiUrl(['rate_limit'])).then(function (d: any) {
            if (d.resources && d.resources.core) {
                self.rateLimit.remaining = d.resources.core.remaining;
                self.rateLimit.limit = d.resources.core.limit;
                self.rateLimit.reset = d.resources.core.reset;
            }
            return self.rateLimit;
        }).catch(function () { return self.rateLimit; });
    },

    // Get file content, routed through the server's Postgres-backed cache so
    // re-analyzing the same repo/branch doesn't re-hit GitHub's rate limit.
    // When `sha` (the blob sha from a tree scan) is supplied, the server caches
    // by content hash instead of path+TTL — valid forever, since a given sha's
    // content can never change. Falls back to hitting GitHub directly (contents
    // API, then raw.githubusercontent.com) if the cache proxy is unreachable.
    getFile(o: string, r: string, p: string, branch?: string, sha?: string) {
        var self = this;
        return fetch(appConfig.apiUrl + '/api/github/file', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner: o, repo: r, path: p, branch: branch, token: this.token || undefined, sha: sha || undefined })
        }).then(function (res) {
            return res.json().then(function (data: any) {
                if (!res.ok || !data.success) throw new Error((data && data.error) || 'Failed to load file');
                return data.content;
            });
        }).catch(function () {
            var url = branch
                ? buildRepoApiUrl(o, r, ['contents'].concat(splitRepoPath(p)), { ref: branch })
                : buildRepoApiUrl(o, r, ['contents'].concat(splitRepoPath(p)));
            return self.fetch(url).then(function (d: any) {
                return d.content ? decodeBase64Utf8(d.content) : null;
            }).catch(function () {
                // Fallback: raw.githubusercontent.com. Send the same token (raw content for
                // private repos 404s — not 401/403 — when unauthenticated) and only guess
                // main/master when no branch was actually supplied.
                var rawHeaders = self.token ? { Authorization: 'Bearer ' + self.token } : undefined;
                var br = branch || 'main';
                var rawUrl = 'https://raw.githubusercontent.com/' + o + '/' + r + '/' + br + '/' + p;
                return fetch(rawUrl, { headers: rawHeaders }).then(function (res2) {
                    if (res2.ok) return res2.text();
                    if (!branch && br === 'main') {
                        return fetch('https://raw.githubusercontent.com/' + o + '/' + r + '/master/' + p, { headers: rawHeaders })
                            .then(function (r2) { return r2.ok ? r2.text() : null; }).catch(function () { return null; });
                    }
                    return null;
                }).catch(function () { return null; });
            });
        });
    },

    getCommits(o: string, r: string, path?: string, limit?: number, branch?: string) {
        var q: any = { per_page: limit || 30 };
        if (path) q.path = path;
        if (branch) q.sha = branch;
        return this.fetch(buildRepoApiUrl(o, r, ['commits'], q)).catch(function () { return []; });
    },

    getBlame(o: string, r: string, path: string, branch?: string) {
        return this.getCommits(o, r, path, 50, branch).then(function (commits: any[]) {
            var authors: any = {};
            commits.forEach(function (c) { var name = c.commit.author.name; authors[name] = (authors[name] || 0) + 1; });
            return Object.entries(authors).map(function (e: any) {
                return { name: e[0], commits: e[1], percent: Math.round(e[1] / commits.length * 100) };
            }).sort(function (a: any, b: any) { return b.commits - a.commits; });
        }).catch(function () { return []; });
    },

    getPR(o: string, r: string, prNum: string | number) {
        var self = this;
        return this.fetch(buildRepoApiUrl(o, r, ['pulls', String(prNum)])).then(function (pr: any) {
            return self.fetch(buildRepoApiUrl(o, r, ['pulls', String(prNum), 'files'])).then(function (files: any) {
                pr.files = files; return pr;
            });
        }).catch(function () { return null; });
    },

    // List branches for a repo
    getBranches(o: string, r: string) {
        return this.fetch(buildRepoApiUrl(o, r, ['branches'], { per_page: 100 }))
            .catch(function () { return []; });
    },

    getCompare(o: string, r: string, base: string, head: string) {
        return this.fetch(buildRepoApiUrl(o, r, ['compare', base + '...' + head]));
    },

    getDefaultBranch(o: string, r: string) {
        return this.fetch(buildRepoApiUrl(o, r)).then(function (repo: any) {
            return repo.default_branch || 'main';
        }).catch(function () { return 'main'; });
    },

    // Fetch the repo tree through the server's Postgres-backed cache (see
    // /api/github/repo) so re-analyzing the same repo/branch doesn't re-hit
    // GitHub's rate limit. Falls back to the Git Trees API directly if the
    // cache proxy itself is unreachable.
    fetchTreeCached(o: string, r: string, branch: string) {
        return fetch(appConfig.apiUrl + '/api/github/repo', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner: o, repo: r, branch: branch, token: this.token || undefined })
        }).then(function (res) {
            return res.json().then(function (data: any) {
                if (!res.ok || !data.success) throw new Error((data && data.error) || 'Failed to load repository tree');
                return { tree: data.tree };
            });
        });
    },

    // Fast scan using Git Trees API (single request for all files!)
    scanTree(o: string, r: string, cb: any, compiledPatterns: any, branch?: string) {
        var self = this;
        if (cb) cb('Fetching repository tree...');
        var branchPromise: Promise<string> = branch
            ? Promise.resolve(branch)
            : this.fetch(buildRepoApiUrl(o, r)).then(function (repo: any) { return repo.default_branch || 'main'; });

        return branchPromise.then(function (br) {
            if (cb) cb('Loading file tree (' + br + ')...');
            return self.fetchTreeCached(o, r, br).catch(function () {
                return self.fetch(buildRepoApiUrl(o, r, ['git', 'trees', br], { recursive: 1 }));
            }).then(function (tree: any) {
                if (!tree.tree) throw new Error('Invalid tree response');
                var f: any[] = [];
                tree.tree.forEach(function (i: any) {
                    if (i.type !== 'blob') return;
                    var name = i.path.includes('/') ? i.path.substring(i.path.lastIndexOf('/') + 1) : i.path;
                    if (shouldExcludeFile(i.path, name, compiledPatterns)) return;
                    var pathParts = i.path.split('/');
                    var ignored = pathParts.slice(0, -1).some(function (part: string, idx: number) {
                        var dirPath = pathParts.slice(0, idx + 1).join('/');
                        return shouldIgnoreDirectory(dirPath, part, compiledPatterns);
                    });
                    if (ignored) return;
                    var folder = i.path.includes('/') ? i.path.substring(0, i.path.lastIndexOf('/')) : 'root';
                    f.push({ path: i.path, name: name, folder: folder, size: i.size || 0, isCode: Parser.isCode(name), branch: br, sha: i.sha });
                });
                if (cb) cb('Found ' + f.length + ' files on ' + br);
                return { files: f, branch: br };
            });
        });
    },

    // Fallback: recursive scan using Contents API
    scanRecursive(o: string, r: string, cb: any, p?: string, d?: number, compiledPatterns?: any, branch?: string): Promise<any[]> {
        var self = this; p = p || ''; d = d || 0;
        if (d > 10) return Promise.resolve([]);
        var url = branch
            ? buildRepoApiUrl(o, r, ['contents'].concat(splitRepoPath(p)), { ref: branch })
            : buildRepoApiUrl(o, r, ['contents'].concat(splitRepoPath(p)));
        return this.fetch(url).then(function (c: any[]) {
            var f: any[] = [];
            var promises: Promise<any[]>[] = [];
            c.forEach(function (i) {
                if (i.type === 'file' && !shouldExcludeFile(i.path, i.name, compiledPatterns)) {
                    f.push({ path: i.path, name: i.name, folder: i.path.includes('/') ? i.path.substring(0, i.path.lastIndexOf('/')) : 'root', size: i.size, isCode: Parser.isCode(i.name) });
                } else if (i.type === 'dir' && !shouldIgnoreDirectory(i.path, i.name, compiledPatterns)) {
                    if (cb) cb('/' + i.path);
                    promises.push(self.scanRecursive(o, r, cb, i.path, d! + 1, compiledPatterns, branch).catch(function () { return []; }));
                }
            });
            return Promise.all(promises).then(function (results) {
                results.forEach(function (res) { f = f.concat(res); });
                return f;
            });
        }).catch(function (e: any) { if (d === 0) throw e; return []; });
    },

    // Smart scan: try tree API first, fallback to recursive
    scan(o: string, r: string, cb: any, compiledPatterns: any, branch?: string) {
        var self = this;
        return this.scanTree(o, r, cb, compiledPatterns, branch).catch(function () {
            if (cb) cb('Tree API failed, using fallback...');
            return self.scanRecursive(o, r, cb, '', 0, compiledPatterns, branch).then(function (files: any[]) {
                return { files: files, branch: branch || 'main' };
            });
        });
    }
};

function buildTree(files: any[]) {
    var root: any = { name: 'root', path: '', children: {}, files: [] };
    files.forEach(function (f) {
        var parts = f.folder && f.folder !== 'root' ? f.folder.split('/') : [];
        var cur = root;
        parts.forEach(function (p: string, i: number) {
            var path = parts.slice(0, i + 1).join('/');
            if (!cur.children[p]) cur.children[p] = { name: p, path: path, children: {}, files: [] };
            cur = cur.children[p];
        });
        cur.files.push(f);
    });
    return root;
}

export { GitHub, buildTree, calcBlast, calcHealth, calcPRRisk, findTestImpact, findDependencyChains };
