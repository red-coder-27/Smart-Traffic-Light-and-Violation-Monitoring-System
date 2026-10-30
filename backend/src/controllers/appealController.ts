import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AppealStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AppealRecord = {
    id: string;
    violationId: string;
    citizenId: string;
    reason: string;
    status: AppealStatus;
    reviewNotes: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    violation?: {
        id: string;
        occurredAt: Date;
        violationType: string;
        description: string | null;
        intersection?: { id: string; name: string; location: string } | null;
        trafficSignal?: { id: string; status: string } | null;
        challan?: {
            id: string;
            challanNumber: string;
            amount: number;
            status: string;
        } | null;
    } | null;
    citizen?: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
    } | null;
};

export type ViolationLookup = {
    id: string;
    violatingUserId: string | null;
    violationType: string;
    occurredAt: Date;
    description: string | null;
};

export type AppealServices = {
    listAppeals(citizenId?: string): Promise<AppealRecord[]>;
    getAppeal(id: string, citizenId?: string): Promise<AppealRecord | null>;
    getViolation(id: string): Promise<ViolationLookup | null>;
    appealExistsForViolation(violationId: string): Promise<boolean>;
    createAppeal(data: {
        violationId: string;
        citizenId: string;
        reason: string;
    }): Promise<AppealRecord>;
    updateAppealStatus(params: {
        id: string;
        status: "APPROVED" | "REJECTED";
        reviewNotes?: string;
        reviewedBy: string;
        reviewedAt: Date;
    }): Promise<AppealRecord | null>;
};

function getAuthenticatedUser(req: Request): { id: string; role: string } | null {
    return (req as AuthenticatedRequest).authenticatedUser ?? null;
}

export function createAppealHandlers(services: AppealServices) {
    return {
        list: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            try {
                const citizenId = user.role === "CITIZEN" ? user.id : undefined;
                const appeals = await services.listAppeals(citizenId);
                res.json({ success: true, appeals });
            } catch (error) {
                console.error("Listing appeals failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        getOne: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const id = req.params.id;
            if (!id || typeof id !== "string" || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid appeal identifier" });
                return;
            }

            try {
                const appeal = await services.getAppeal(id);
                if (!appeal) {
                    res.status(404).json({ success: false, message: "Appeal not found" });
                    return;
                }

                if (user.role === "CITIZEN" && appeal.citizenId !== user.id) {
                    res.status(403).json({ success: false, message: "Forbidden: You are not authorized to view this appeal" });
                    return;
                }

                res.json({ success: true, appeal });
            } catch (error) {
                console.error("Fetching appeal failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        submit: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const body = (req.body ?? {}) as Record<string, unknown>;
            const violationId = body.violationId;
            if (typeof violationId !== "string" || !UUID_PATTERN.test(violationId)) {
                res.status(400).json({ success: false, message: "Valid violationId is required" });
                return;
            }

            const reason = body.reason;
            if (
                typeof reason !== "string" ||
                reason.trim().length < 10 ||
                reason.trim().length > 1000
            ) {
                res.status(400).json({
                    success: false,
                    message: "Appeal reason is required and must be between 10 and 1000 characters",
                });
                return;
            }

            try {
                const violation = await services.getViolation(violationId);
                if (!violation) {
                    res.status(404).json({ success: false, message: "Violation not found" });
                    return;
                }

                // Check citizen authorization: only the citizen assigned to the violation can appeal
                if (user.role === "CITIZEN" && violation.violatingUserId !== user.id) {
                    res.status(403).json({
                        success: false,
                        message: "Forbidden: You are not authorized to appeal this violation",
                    });
                    return;
                }

                // Duplicate check
                const exists = await services.appealExistsForViolation(violationId);
                if (exists) {
                    res.status(409).json({
                        success: false,
                        message: "An appeal has already been submitted for this violation",
                    });
                    return;
                }

                const assignedCitizenId = violation.violatingUserId || user.id;
                const appeal = await services.createAppeal({
                    violationId,
                    citizenId: assignedCitizenId,
                    reason: reason.trim(),
                });

                res.status(201).json({ success: true, appeal });
            } catch (error) {
                console.error("Submitting appeal failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },

        updateStatus: async (req: Request, res: Response): Promise<void> => {
            const user = getAuthenticatedUser(req);
            if (!user) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            if (user.role !== "ADMIN" && user.role !== "TRAFFIC_POLICE") {
                res.status(403).json({ success: false, message: "Forbidden: insufficient permissions" });
                return;
            }

            const id = req.params.id;
            if (!id || typeof id !== "string" || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid appeal identifier" });
                return;
            }

            const body = (req.body ?? {}) as Record<string, unknown>;
            const rawStatus = typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
            if (rawStatus !== "APPROVED" && rawStatus !== "REJECTED") {
                res.status(400).json({ success: false, message: "Invalid status: must be APPROVED or REJECTED" });
                return;
            }

            let reviewNotes: string | undefined;
            if (body.reviewNotes !== undefined) {
                if (typeof body.reviewNotes !== "string" || body.reviewNotes.trim().length > 1000) {
                    res.status(400).json({ success: false, message: "Review notes must be a string up to 1000 characters" });
                    return;
                }
                reviewNotes = body.reviewNotes.trim();
            }

            try {
                const updated = await services.updateAppealStatus({
                    id,
                    status: rawStatus as "APPROVED" | "REJECTED",
                    reviewNotes,
                    reviewedBy: user.id,
                    reviewedAt: new Date(),
                });

                if (!updated) {
                    res.status(404).json({ success: false, message: "Appeal not found" });
                    return;
                }

                res.json({ success: true, appeal: updated });
            } catch (error) {
                console.error("Updating appeal status failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
    };
}

const defaultServices: AppealServices = {
    listAppeals: async (citizenId) => {
        return prisma.appeal.findMany({
            where: citizenId ? { citizenId } : undefined,
            orderBy: { createdAt: "desc" },
            include: {
                violation: {
                    select: {
                        id: true,
                        occurredAt: true,
                        violationType: true,
                        description: true,
                        intersection: { select: { id: true, name: true, location: true } },
                        trafficSignal: { select: { id: true, status: true } },
                        challan: { select: { id: true, challanNumber: true, amount: true, status: true } },
                    },
                },
                citizen: {
                    select: { id: true, name: true, email: true, phone: true },
                },
            },
        }) as unknown as Promise<AppealRecord[]>;
    },

    getAppeal: async (id, citizenId) => {
        return prisma.appeal.findFirst({
            where: { id, ...(citizenId ? { citizenId } : {}) },
            include: {
                violation: {
                    select: {
                        id: true,
                        occurredAt: true,
                        violationType: true,
                        description: true,
                        intersection: { select: { id: true, name: true, location: true } },
                        trafficSignal: { select: { id: true, status: true } },
                        challan: { select: { id: true, challanNumber: true, amount: true, status: true } },
                    },
                },
                citizen: {
                    select: { id: true, name: true, email: true, phone: true },
                },
            },
        }) as unknown as Promise<AppealRecord | null>;
    },

    getViolation: async (id) => {
        return prisma.violation.findUnique({
            where: { id },
            select: {
                id: true,
                violatingUserId: true,
                violationType: true,
                occurredAt: true,
                description: true,
            },
        });
    },

    appealExistsForViolation: async (violationId) => {
        const count = await prisma.appeal.count({ where: { violationId } });
        return count > 0;
    },

    createAppeal: async (data) => {
        return prisma.appeal.create({
            data: {
                violationId: data.violationId,
                citizenId: data.citizenId,
                reason: data.reason,
                status: "PENDING",
            },
            include: {
                violation: {
                    select: {
                        id: true,
                        occurredAt: true,
                        violationType: true,
                        description: true,
                        intersection: { select: { id: true, name: true, location: true } },
                        trafficSignal: { select: { id: true, status: true } },
                        challan: { select: { id: true, challanNumber: true, amount: true, status: true } },
                    },
                },
                citizen: {
                    select: { id: true, name: true, email: true, phone: true },
                },
            },
        }) as unknown as Promise<AppealRecord>;
    },

    updateAppealStatus: async (params) => {
        try {
            return await prisma.appeal.update({
                where: { id: params.id },
                data: {
                    status: params.status,
                    reviewNotes: params.reviewNotes ?? null,
                    reviewedBy: params.reviewedBy,
                    reviewedAt: params.reviewedAt,
                },
                include: {
                    violation: {
                        select: {
                            id: true,
                            occurredAt: true,
                            violationType: true,
                            description: true,
                            intersection: { select: { id: true, name: true, location: true } },
                            trafficSignal: { select: { id: true, status: true } },
                            challan: { select: { id: true, challanNumber: true, amount: true, status: true } },
                        },
                    },
                    citizen: {
                        select: { id: true, name: true, email: true, phone: true },
                    },
                },
            }) as unknown as AppealRecord;
        } catch {
            return null;
        }
    },
};

const defaultHandlers = createAppealHandlers(defaultServices);

export const listAppeals = defaultHandlers.list;
export const getAppeal = defaultHandlers.getOne;
export const submitAppeal = defaultHandlers.submit;
export const updateAppealStatus = defaultHandlers.updateStatus;

