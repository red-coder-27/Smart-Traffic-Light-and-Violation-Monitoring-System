import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set([
    "occurredAt",
    "intersectionId",
    "trafficSignalId",
    "violationType",
    "description",
    "violatingUserId",
]);
const VIOLATION_ACCESS_ROLES = ["ADMIN", "TRAFFIC_POLICE", "CITIZEN"] as const;
type ViolationAccessRole = (typeof VIOLATION_ACCESS_ROLES)[number];

type ViolationRecord = {
    id: string;
    occurredAt: Date;
    intersectionId: string;
    trafficSignalId: string;
    violationType: string;
    description: string | null;
    recordedByUserId: string;
    violatingUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    intersection?: { id: string; name: string; location: string } | null;
    trafficSignal?: { id: string; status: "RED" | "YELLOW" | "GREEN" } | null;
};

type ViolationInput = {
    occurredAt: Date;
    intersectionId: string;
    trafficSignalId: string;
    violationType: string;
    description?: string;
    violatingUserId?: string;
};

type UserAccount = {
    id: string;
    role: string;
    isActive: boolean;
};

export type ViolationServices = {
    createViolation(data: ViolationInput & { recordedByUserId: string }): Promise<ViolationRecord>;
    listViolations(violatingUserId?: string): Promise<ViolationRecord[]>;
    getViolation(id: string, violatingUserId?: string): Promise<ViolationRecord | null>;
    intersectionExists(id: string): Promise<boolean>;
    signalBelongsToIntersection(signalId: string, intersectionId: string): Promise<boolean>;
    getUser(id: string): Promise<UserAccount | null>;
    isCitizen(id: string): Promise<boolean>;
};

function isDatabaseError(error: unknown, code: string): boolean {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === code;
}

function getAuthenticatedUser(req: Request): { id: string; role: string } | null {
    return (req as AuthenticatedRequest).authenticatedUser ?? null;
}

function getIdParam(req: Request): string | null {
    const id = req.params.id;
    return typeof id === "string" ? id : null;
}

function isViolationAccessRole(role: string): role is ViolationAccessRole {
    return VIOLATION_ACCESS_ROLES.includes(role as ViolationAccessRole);
}

function validateInput(body: Record<string, unknown>): ViolationInput | null {
    if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) return null;
    if (typeof body.occurredAt !== "string" || Number.isNaN(new Date(body.occurredAt).getTime())) return null;
    if (typeof body.intersectionId !== "string" || !UUID_PATTERN.test(body.intersectionId)) return null;
    if (typeof body.trafficSignalId !== "string" || !UUID_PATTERN.test(body.trafficSignalId)) return null;
    if (
        typeof body.violationType !== "string"
        || !body.violationType.trim()
        || body.violationType.trim().length > 80
    ) return null;
    if (body.description !== undefined && (
        typeof body.description !== "string"
        || body.description.trim().length > 1000
    )) return null;
    if (body.violatingUserId !== undefined && (
        typeof body.violatingUserId !== "string"
        || !UUID_PATTERN.test(body.violatingUserId)
    )) return null;

    return {
        occurredAt: new Date(body.occurredAt),
        intersectionId: body.intersectionId,
        trafficSignalId: body.trafficSignalId,
        violationType: body.violationType.trim(),
        ...(body.description === undefined ? {} : { description: body.description.trim() }),
        ...(body.violatingUserId === undefined ? {} : { violatingUserId: body.violatingUserId }),
    };
}

export function createViolationHandlers(services: ViolationServices) {
    return {
        create: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const data = validateInput((req.body ?? {}) as Record<string, unknown>);
            if (!data) {
                res.status(400).json({ success: false, message: "Invalid violation data" });
                return;
            }

            try {
                const recorder = await services.getUser(authenticatedUser.id);
                if (
                    !recorder
                    || !recorder.isActive
                    || !isViolationAccessRole(recorder.role)
                    || recorder.role === "CITIZEN"
                ) {
                    res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                    return;
                }
                if (!await services.intersectionExists(data.intersectionId)) {
                    res.status(404).json({ success: false, message: "Intersection not found" });
                    return;
                }
                if (!await services.signalBelongsToIntersection(data.trafficSignalId, data.intersectionId)) {
                    res.status(404).json({ success: false, message: "Traffic signal not found for intersection" });
                    return;
                }
                if (data.violatingUserId && !await services.isCitizen(data.violatingUserId)) {
                    res.status(404).json({ success: false, message: "Violating user not found" });
                    return;
                }

                const violation = await services.createViolation({
                    ...data,
                    recordedByUserId: authenticatedUser.id,
                });
                res.status(201).json({ success: true, violation });
            } catch (error) {
                if (isDatabaseError(error, "P2003") || isDatabaseError(error, "P2025")) {
                    res.status(404).json({ success: false, message: "Referenced violation data was not found" });
                    return;
                }
                console.error("Creating violation failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        list: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }
            if (!isViolationAccessRole(authenticatedUser.role)) {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            try {
                const violations = await services.listViolations(
                    authenticatedUser.role === "CITIZEN" ? authenticatedUser.id : undefined,
                );
                res.json({ success: true, violations });
            } catch (error) {
                console.error("Listing violations failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        getOne: async (req: Request, res: Response): Promise<void> => {
            const authenticatedUser = getAuthenticatedUser(req);
            if (!authenticatedUser) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }
            if (!isViolationAccessRole(authenticatedUser.role)) {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const id = getIdParam(req);
            if (!id || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid violation ID" });
                return;
            }

            try {
                const violation = await services.getViolation(
                    id,
                    authenticatedUser.role === "CITIZEN" ? authenticatedUser.id : undefined,
                );
                if (!violation) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }
                res.json({ success: true, violation });
            } catch (error) {
                console.error("Fetching violation failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
    };
}

const handlers = createViolationHandlers({
    createViolation: (data) => prisma.violation.create({
        data,
        include: {
            intersection: { select: { id: true, name: true, location: true } },
            trafficSignal: { select: { id: true, status: true } },
        },
    }),
    listViolations: (violatingUserId) => prisma.violation.findMany({
        where: violatingUserId ? { violatingUserId } : undefined,
        orderBy: { occurredAt: "desc" },
        include: {
            intersection: { select: { id: true, name: true, location: true } },
            trafficSignal: { select: { id: true, status: true } },
        },
    }),
    getViolation: (id, violatingUserId) => prisma.violation.findFirst({
        where: { id, ...(violatingUserId ? { violatingUserId } : {}) },
        include: {
            intersection: { select: { id: true, name: true, location: true } },
            trafficSignal: { select: { id: true, status: true } },
        },
    }),
    intersectionExists: async (id) => Boolean(await prisma.intersection.findUnique({ where: { id }, select: { id: true } })),
    signalBelongsToIntersection: async (signalId, intersectionId) => Boolean(
        await prisma.trafficSignal.findFirst({ where: { id: signalId, intersectionId }, select: { id: true } }),
    ),
    getUser: (id) => prisma.user.findUnique({
        where: { id },
        select: { id: true, role: true, isActive: true },
    }),
    isCitizen: async (id) => Boolean(await prisma.user.findFirst({
        where: { id, role: "CITIZEN" },
        select: { id: true },
    })),
});

export const createViolation = handlers.create;
export const listViolations = handlers.list;
export const getViolation = handlers.getOne;
