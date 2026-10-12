import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
    createEvidenceStorage,
    type EvidenceStorage,
} from "../evidence/evidenceStorage.js";
import {
    createEvidenceStorageKey,
    validateEvidenceFile,
    type EvidenceFileInput,
} from "../evidence/evidenceValidation.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_EVIDENCE_ROLES = ["ADMIN", "TRAFFIC_POLICE", "CITIZEN"] as const;
type AllowedEvidenceRole = (typeof ALLOWED_EVIDENCE_ROLES)[number];

export type EvidenceRecord = {
    id: string;
    violationId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    uploaderId: string;
    createdAt: Date;
};

export type EvidenceCreateInput = {
    id: string;
    violationId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    uploaderId: string;
};

export type EvidenceViolationLookup = {
    id: string;
    violatingUserId: string | null;
};

export type EvidenceUserAccount = {
    id: string;
    role: string;
    isActive: boolean;
};

export type EvidenceServices = {
    createEvidence(data: EvidenceCreateInput): Promise<EvidenceRecord>;
    listEvidence(violationId: string): Promise<EvidenceRecord[]>;
    getEvidence(violationId: string, evidenceId: string): Promise<EvidenceRecord | null>;
    getViolation(violationId: string): Promise<EvidenceViolationLookup | null>;
    getUser(id: string): Promise<EvidenceUserAccount | null>;
    storage: EvidenceStorage;
};

function getAuthenticatedUser(req: Request): { id: string; role: string } | null {
    return (req as AuthenticatedRequest).authenticatedUser ?? null;
}

function getViolationId(req: Request): string | null {
    const id = req.params.id || req.params.violationId;
    return typeof id === "string" ? id : null;
}

function getEvidenceId(req: Request): string | null {
    const id = req.params.evidenceId;
    return typeof id === "string" ? id : null;
}

function isAllowedRole(role: string): role is AllowedEvidenceRole {
    return ALLOWED_EVIDENCE_ROLES.includes(role as AllowedEvidenceRole);
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function isValidBase64String(str: string): boolean {
    if (!str || str.length % 4 !== 0) return false;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false;
    const firstEq = str.indexOf("=");
    if (firstEq !== -1) {
        if (firstEq < str.length - 2) return false;
        if (firstEq === str.length - 2 && str[str.length - 1] !== "=") return false;
    }
    try {
        return Buffer.from(str, "base64").toString("base64") === str;
    } catch {
        return false;
    }
}

type ParsedFileResult =
    | { valid: true; fileInput: EvidenceFileInput; buffer: Uint8Array }
    | { valid: false; statusCode: 400 | 413 | 415; message: string };

function parseFilePayload(body: unknown): ParsedFileResult {
    if (!body || typeof body !== "object") {
        return { valid: false, statusCode: 400, message: "Invalid evidence file metadata" };
    }
    const raw = (body as Record<string, unknown>).file ?? body;
    if (!raw || typeof raw !== "object") {
        return { valid: false, statusCode: 400, message: "Invalid evidence file metadata" };
    }
    const candidate = raw as Record<string, unknown>;

    if (
        typeof candidate.originalName !== "string" ||
        !candidate.originalName.trim() ||
        typeof candidate.mimeType !== "string"
    ) {
        return { valid: false, statusCode: 400, message: "Invalid evidence file metadata" };
    }

    if (typeof candidate.sizeBytes === "number" && candidate.sizeBytes > MAX_FILE_SIZE_BYTES) {
        return { valid: false, statusCode: 413, message: "Evidence file exceeds the 10 MB size limit" };
    }

    if (candidate.content === undefined) {
        return { valid: false, statusCode: 400, message: "Evidence file content is required" };
    }

    let buffer: Uint8Array;
    if (candidate.content instanceof Uint8Array) {
        buffer = candidate.content;
    } else if (typeof candidate.content === "string") {
        const base64Data = candidate.content.replace(/^data:[^;]+;base64,/, "").trim();
        if (!base64Data) {
            return { valid: false, statusCode: 400, message: "Evidence file cannot be empty" };
        }
        if (!isValidBase64String(base64Data)) {
            return { valid: false, statusCode: 400, message: "Malformed or invalid Base64 file content" };
        }
        buffer = Buffer.from(base64Data, "base64");
    } else {
        return { valid: false, statusCode: 400, message: "Invalid evidence file metadata" };
    }

    if (buffer.length === 0) {
        return { valid: false, statusCode: 400, message: "Evidence file cannot be empty" };
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return { valid: false, statusCode: 413, message: "Evidence file exceeds the 10 MB size limit" };
    }

    if (candidate.sizeBytes !== undefined) {
        if (typeof candidate.sizeBytes !== "number" || !Number.isInteger(candidate.sizeBytes) || candidate.sizeBytes <= 0) {
            return { valid: false, statusCode: 400, message: "Invalid evidence file metadata" };
        }
        if (candidate.sizeBytes !== buffer.length) {
            return { valid: false, statusCode: 400, message: "Evidence file size does not match declared size" };
        }
    }

    const sizeBytes = buffer.length;

    return {
        valid: true,
        fileInput: {
            originalName: candidate.originalName.trim(),
            mimeType: candidate.mimeType,
            sizeBytes,
            content: buffer,
        },
        buffer,
    };
}

let defaultStorageInstance: EvidenceStorage | null = null;
function getDefaultStorage(): EvidenceStorage {
    if (!defaultStorageInstance) {
        defaultStorageInstance = createEvidenceStorage();
    }
    return defaultStorageInstance;
}

export function createEvidenceHandlers(services: EvidenceServices) {
    return {
        upload: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            if (authenticatedUser.role !== "ADMIN" && authenticatedUser.role !== "TRAFFIC_POLICE") {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const violationId = getViolationId(req);
            if (!violationId || !UUID_PATTERN.test(violationId)) {
                res.status(400).json({ success: false, message: "Invalid violation ID" });
                return;
            }

            try {
                const uploader = await services.getUser(authenticatedUser.id);
                if (!uploader || !uploader.isActive || (uploader.role !== "ADMIN" && uploader.role !== "TRAFFIC_POLICE")) {
                    res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                    return;
                }

                const violation = await services.getViolation(violationId);
                if (!violation) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                const parsed = parseFilePayload(req.body);
                if (!parsed.valid) {
                    res.status(parsed.statusCode).json({ success: false, message: parsed.message });
                    return;
                }

                const validation = validateEvidenceFile(parsed.fileInput, parsed.buffer);
                if (!validation.valid) {
                    res.status(validation.statusCode).json({ success: false, message: validation.message });
                    return;
                }

                const evidenceId = randomUUID();
                const storageKey = createEvidenceStorageKey(violationId, evidenceId, validation.file.originalName);

                try {
                    await services.storage.upload({
                        key: storageKey,
                        contentType: validation.file.mimeType,
                        body: parsed.buffer,
                    });
                } catch (storageError) {
                    console.error("Evidence storage upload failed:", storageError);
                    res.status(500).json({
                        success: false,
                        message: storageError instanceof Error ? storageError.message : "Evidence upload failed",
                    });
                    return;
                }

                try {
                    const evidence = await services.createEvidence({
                        id: evidenceId,
                        violationId,
                        originalName: validation.file.originalName,
                        mimeType: validation.file.mimeType,
                        sizeBytes: validation.file.sizeBytes,
                        storageKey,
                        uploaderId: authenticatedUser.id,
                    });

                    res.status(201).json({ success: true, evidence });
                } catch (dbError) {
                    try {
                        await services.storage.delete(storageKey);
                    } catch (cleanupError) {
                        console.error("Storage cleanup after failed database save failed:", cleanupError);
                    }
                    console.error("Database save failed for evidence:", dbError);
                    res.status(500).json({ success: false, message: "Internal server error" });
                }
            } catch (error) {
                console.error("Evidence upload handler failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        list: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            if (!isAllowedRole(authenticatedUser.role)) {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const violationId = getViolationId(req);
            if (!violationId || !UUID_PATTERN.test(violationId)) {
                res.status(400).json({ success: false, message: "Invalid violation ID" });
                return;
            }

            try {
                const violation = await services.getViolation(violationId);
                if (!violation) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                if (authenticatedUser.role === "CITIZEN" && violation.violatingUserId !== authenticatedUser.id) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                const evidence = await services.listEvidence(violationId);
                res.status(200).json({ success: true, evidence });
            } catch (error) {
                console.error("Listing evidence failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        getOne: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            if (!isAllowedRole(authenticatedUser.role)) {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const violationId = getViolationId(req);
            const evidenceId = getEvidenceId(req);
            if (!violationId || !UUID_PATTERN.test(violationId) || !evidenceId || !UUID_PATTERN.test(evidenceId)) {
                res.status(400).json({ success: false, message: "Invalid ID" });
                return;
            }

            try {
                const violation = await services.getViolation(violationId);
                if (!violation) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                if (authenticatedUser.role === "CITIZEN" && violation.violatingUserId !== authenticatedUser.id) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                const evidence = await services.getEvidence(violationId, evidenceId);
                if (!evidence) {
                    res.status(404).json({ success: false, message: "Evidence not found" });
                    return;
                }

                res.status(200).json({ success: true, evidence });
            } catch (error) {
                console.error("Fetching evidence failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        getContent: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            if (!isAllowedRole(authenticatedUser.role)) {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const violationId = getViolationId(req);
            const evidenceId = getEvidenceId(req);
            if (!violationId || !UUID_PATTERN.test(violationId) || !evidenceId || !UUID_PATTERN.test(evidenceId)) {
                res.status(400).json({ success: false, message: "Invalid ID" });
                return;
            }

            try {
                const violation = await services.getViolation(violationId);
                if (!violation) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                if (authenticatedUser.role === "CITIZEN" && violation.violatingUserId !== authenticatedUser.id) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                const evidence = await services.getEvidence(violationId, evidenceId);
                if (!evidence) {
                    res.status(404).json({ success: false, message: "Evidence not found" });
                    return;
                }

                if (!services.storage.get) {
                    res.status(500).json({ success: false, message: "Storage content retrieval not configured" });
                    return;
                }

                const content = await services.storage.get(evidence.storageKey);
                if (!content) {
                    res.status(404).json({ success: false, message: "Evidence content not found" });
                    return;
                }

                res.setHeader("Content-Type", content.contentType);
                res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(evidence.originalName)}"`);
                res.send(Buffer.from(content.body));
            } catch (error) {
                console.error("Fetching evidence content failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
    };
}

const handlers = createEvidenceHandlers({
    createEvidence: (data) => prisma.evidence.create({ data }),
    listEvidence: (violationId) => prisma.evidence.findMany({
        where: { violationId },
        orderBy: { createdAt: "desc" },
    }),
    getEvidence: (violationId, evidenceId) => prisma.evidence.findFirst({
        where: { id: evidenceId, violationId },
    }),
    getViolation: (id) => prisma.violation.findUnique({
        where: { id },
        select: { id: true, violatingUserId: true },
    }),
    getUser: (id) => prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, isActive: true },
    }),
    get storage() {
        return getDefaultStorage();
    },
});

export const uploadEvidence = handlers.upload;
export const listEvidence = handlers.list;
export const getEvidence = handlers.getOne;
export const getEvidenceContent = handlers.getContent;
