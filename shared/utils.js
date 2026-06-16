import { randomUUID } from 'crypto';
export function generateId() {
    return randomUUID();
}
export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}
//# sourceMappingURL=utils.js.map