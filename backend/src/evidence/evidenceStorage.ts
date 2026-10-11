export type EvidenceStorageUpload = {
    key: string;
    contentType: string;
    body: Uint8Array | NodeJS.ReadableStream;
};

export type EvidenceStorageDownload = {
    contentType: string;
    body: Uint8Array;
};

export type EvidenceStorage = {
    upload(file: EvidenceStorageUpload): Promise<void>;
    delete(key: string): Promise<void>;
    get?(key: string): Promise<EvidenceStorageDownload | null>;
};

export function isEvidenceStorageConfigured(): boolean {
    return false;
}

export function createEvidenceStorage(): EvidenceStorage {
    throw new Error(
        "Evidence storage is not configured. STLV4-11 requires a private object-storage provider before uploads can be enabled.",
    );
}

export function createMemoryEvidenceStorage(): EvidenceStorage {
    const store = new Map<string, { contentType: string; body: Uint8Array }>();

    return {
        async upload(file: EvidenceStorageUpload): Promise<void> {
            let buffer: Uint8Array;
            if (file.body instanceof Uint8Array) {
                buffer = file.body;
            } else {
                const chunks: Buffer[] = [];
                for await (const chunk of file.body) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                }
                buffer = Buffer.concat(chunks);
            }
            store.set(file.key, { contentType: file.contentType, body: buffer });
        },
        async delete(key: string): Promise<void> {
            store.delete(key);
        },
        async get(key: string): Promise<EvidenceStorageDownload | null> {
            return store.get(key) ?? null;
        },
    };
}
