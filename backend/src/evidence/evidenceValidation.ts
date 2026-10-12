const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const SUPPORTED_EVIDENCE_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "application/pdf",
] as const;

type SupportedEvidenceMimeType = (typeof SUPPORTED_EVIDENCE_MIME_TYPES)[number];

export type EvidenceFileInput = {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    content?: Uint8Array;
};

export type ValidatedEvidenceFile = EvidenceFileInput & {
    mimeType: SupportedEvidenceMimeType;
};

export type EvidenceValidationResult =
    | { valid: true; file: ValidatedEvidenceFile }
    | { valid: false; message: string; statusCode: 400 | 413 | 415 };

function isSupportedMimeType(value: string): value is SupportedEvidenceMimeType {
    return (SUPPORTED_EVIDENCE_MIME_TYPES as readonly string[]).includes(value);
}

function getSafeExtension(originalName: string): string {
    const extension = originalName.trim().toLowerCase().match(/\.([a-z0-9]{1,10})$/)?.[1];
    return extension ? `.${extension}` : "";
}

export function matchesMimeTypeSignature(
    mimeType: SupportedEvidenceMimeType,
    buffer: Uint8Array,
): boolean {
    if (buffer.length === 0) return false;
    switch (mimeType) {
        case "image/jpeg":
            return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        case "image/png":
            return (
                buffer.length >= 8 &&
                buffer[0] === 0x89 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x4e &&
                buffer[3] === 0x47 &&
                buffer[4] === 0x0d &&
                buffer[5] === 0x0a &&
                buffer[6] === 0x1a &&
                buffer[7] === 0x0a
            );
        case "image/webp":
            if (buffer.length < 12) return false;
            return (
                buffer[0] === 0x52 &&
                buffer[1] === 0x49 &&
                buffer[2] === 0x46 &&
                buffer[3] === 0x46 &&
                buffer[8] === 0x57 &&
                buffer[9] === 0x45 &&
                buffer[10] === 0x42 &&
                buffer[11] === 0x50
            );
        case "application/pdf":
            return (
                buffer.length >= 4 &&
                buffer[0] === 0x25 &&
                buffer[1] === 0x50 &&
                buffer[2] === 0x44 &&
                buffer[3] === 0x46
            );
        case "video/mp4":
            return (
                buffer.length >= 8 &&
                buffer[4] === 0x66 &&
                buffer[5] === 0x74 &&
                buffer[6] === 0x79 &&
                buffer[7] === 0x70
            );
        default:
            return false;
    }
}

export function validateEvidenceFile(
    file: EvidenceFileInput | undefined,
    content?: Uint8Array,
): EvidenceValidationResult {
    if (!file) {
        return {
            valid: false,
            statusCode: 400,
            message: "Exactly one evidence file is required",
        };
    }

    if (
        typeof file.originalName !== "string" ||
        !file.originalName.trim() ||
        typeof file.mimeType !== "string" ||
        typeof file.sizeBytes !== "number" ||
        !Number.isInteger(file.sizeBytes)
    ) {
        return {
            valid: false,
            statusCode: 400,
            message: "Invalid evidence file metadata",
        };
    }

    if (file.sizeBytes <= 0) {
        return {
            valid: false,
            statusCode: 400,
            message: "Evidence file cannot be empty",
        };
    }

    if (!isSupportedMimeType(file.mimeType)) {
        return {
            valid: false,
            statusCode: 415,
            message: "Unsupported evidence file type",
        };
    }

    if (file.sizeBytes > MAX_FILE_SIZE_BYTES) {
        return {
            valid: false,
            statusCode: 413,
            message: "Evidence file exceeds the 10 MB size limit",
        };
    }

    const payload = content ?? file.content;
    if (payload !== undefined) {
        if (payload.length === 0) {
            return {
                valid: false,
                statusCode: 400,
                message: "Evidence file cannot be empty",
            };
        }

        if (payload.length > MAX_FILE_SIZE_BYTES) {
            return {
                valid: false,
                statusCode: 413,
                message: "Evidence file exceeds the 10 MB size limit",
            };
        }

        if (file.sizeBytes !== payload.length) {
            return {
                valid: false,
                statusCode: 400,
                message: "Evidence file size does not match declared size",
            };
        }

        if (!matchesMimeTypeSignature(file.mimeType, payload)) {
            return {
                valid: false,
                statusCode: 400,
                message: "Malformed or invalid evidence file content",
            };
        }
    }

    return {
        valid: true,
        file: {
            originalName: file.originalName.trim(),
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            ...(payload !== undefined ? { content: payload } : {}),
        },
    };
}

export function validateEvidenceFiles(files: EvidenceFileInput[] | undefined): EvidenceValidationResult {
    if (!files || files.length !== 1) {
        return {
            valid: false,
            statusCode: 400,
            message: "Exactly one evidence file is required",
        };
    }

    return validateEvidenceFile(files[0]);
}

export function createEvidenceStorageKey(
    violationId: string,
    evidenceId: string,
    originalName: string,
): string {
    const extension = getSafeExtension(originalName);
    return `violations/${encodeURIComponent(violationId)}/${encodeURIComponent(evidenceId)}/file${extension}`;
}
