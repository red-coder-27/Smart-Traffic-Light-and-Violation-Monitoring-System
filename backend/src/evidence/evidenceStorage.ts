export type EvidenceStorageUpload = {
    key: string;
    contentType: string;
    body: Uint8Array | NodeJS.ReadableStream;
};

export type EvidenceStorage = {
    upload(file: EvidenceStorageUpload): Promise<void>;
    delete(key: string): Promise<void>;
};

export function createEvidenceStorage(): EvidenceStorage {
    throw new Error(
        "Evidence storage is not configured. STLV4-11 requires a private object-storage provider before uploads can be enabled.",
    );
}
