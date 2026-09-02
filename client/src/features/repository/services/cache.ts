class RepoCache {
    private cache: Map<string, any> = new Map();

    set(key: string, value: any, ttl: number = 300000) { // Default 5 mins
        this.cache.set(key, {
            value,
            expiry: Date.now() + ttl
        });
    }

    get(key: string) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    clear() {
        this.cache.clear();
    }
}

export const repoCache = new RepoCache();
