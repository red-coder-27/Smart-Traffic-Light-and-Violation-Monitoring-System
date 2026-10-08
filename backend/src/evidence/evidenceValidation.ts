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

export function validateEvidenceFile(file: EvidenceFileInput | undefined): EvidenceValidationResult {
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
        !Number.isInteger(file.sizeBytes) ||
        file.sizeBytes < 0
    ) {
        return {
            valid: false,
            statusCode: 400,
            message: "Invalid evidence file metadata",
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

    return {
        valid: true,
        file: {
            originalName: file.originalName.trim(),
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
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
