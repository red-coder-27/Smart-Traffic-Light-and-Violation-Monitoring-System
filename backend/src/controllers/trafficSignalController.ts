import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNAL_STATUSES = ["RED", "YELLOW", "GREEN"] as const;
const REQUIRED_TIMINGS = ["greenDuration", "yellowDuration", "redDuration"] as const;

type SignalStatus = (typeof SIGNAL_STATUSES)[number];

type SignalConfigInput = {
    status: SignalStatus;
    greenDuration: number;
    yellowDuration: number;
    redDuration: number;
};

type SignalPayload = {
    id: string;
    intersectionId: string;
    status: SignalStatus;
    greenDuration: number;
    yellowDuration: number;
    redDuration: number;
    createdAt: Date;
    updatedAt: Date;
    intersection: {
        id: string;
        name: string;
        location: string;
        status: "ACTIVE" | "INACTIVE";
    } | null;
};

export type TrafficSignalServices = {
    listSignals(): Promise<SignalPayload[]>;
    getSignal(id: string): Promise<SignalPayload | null>;
    updateSignalConfig(id: string, data: SignalConfigInput, changedByUserId?: string | null): Promise<SignalPayload>;
    getSignalHistory(signalId: string): Promise<Array<{
        id: string;
        signalId: string;
        previousConfig: string | null;
        newConfig: string;
        changedByUserId: string | null;
        createdAt: Date;
        changedByUser?: { id: string; name: string } | null;
    }>>;
};

function isValidPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isDatabaseError(error: unknown, code: string): boolean {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === code;
}

function toSignalPayload(signal: {
    id: string;
    intersectionId: string;
    status: SignalStatus;
    greenDuration: number;
    yellowDuration: number;
    redDuration: number;
    createdAt: Date;
    updatedAt: Date;
    intersection?: {
        id: string;
        name: string;
        location: string;
        status: "ACTIVE" | "INACTIVE";
    } | null;
}): SignalPayload {
    return {
        id: signal.id,
        intersectionId: signal.intersectionId,
        status: signal.status,
        greenDuration: signal.greenDuration,
        yellowDuration: signal.yellowDuration,
        redDuration: signal.redDuration,
        createdAt: signal.createdAt,
        updatedAt: signal.updatedAt,
        intersection: signal.intersection ?? null,
    };
}

function validateSignalConfig(body: Record<string, unknown>): SignalConfigInput | null {
    if (typeof body.status !== "string" || !SIGNAL_STATUSES.includes(body.status as SignalStatus)) {
        return null;
    }

    for (const field of REQUIRED_TIMINGS) {
        if (!isValidPositiveInteger(body[field])) {
            return null;
        }
    }

    return {
        status: body.status as SignalStatus,
        greenDuration: body.greenDuration as number,
        yellowDuration: body.yellowDuration as number,
        redDuration: body.redDuration as number,
    };
}

function getSignalIdParam(req: Request): string | null {
    const id = req.params.id;
    return typeof id === "string" ? id : null;
}

export function createTrafficSignalHandlers(services: TrafficSignalServices) {
    return {
        list: async (_req: Request, res: Response): Promise<void> => {
            try {
                const signals = await services.listSignals();
                res.json({ success: true, signals });
            } catch (error) {
                console.error("Listing traffic signals failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        getOne: async (req: Request, res: Response): Promise<void> => {
            const id = getSignalIdParam(req);
            if (!id || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid signal ID" });
                return;
            }

            try {
                const signal = await services.getSignal(id);
                if (!signal) {
                    res.status(404).json({ success: false, message: "Traffic signal not found" });
                    return;
                }
                res.json({ success: true, signal });
            } catch (error) {
                console.error("Fetching traffic signal failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        updateConfig: async (req: Request, res: Response): Promise<void> => {
            const id = getSignalIdParam(req);
            if (!id || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid signal ID" });
                return;
            }

            const data = validateSignalConfig((req.body ?? {}) as Record<string, unknown>);
            if (!data) {
                res.status(400).json({
                    success: false,
                    message: "Invalid signal timing configuration. Provide status, greenDuration, yellowDuration and redDuration as positive integers.",
                });
                return;
            }

            try {
                const updatedSignal = await services.updateSignalConfig(
                    id,
                    data,
                    (req as AuthenticatedRequest).authenticatedUser?.id ?? null,
                );
                res.json({ success: true, signal: updatedSignal, message: "Signal configuration updated successfully." });
            } catch (error) {
                if (isDatabaseError(error, "P2025")) {
                    res.status(404).json({ success: false, message: "Traffic signal not found" });
                    return;
                }
                console.error("Updating traffic signal config failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        getHistory: async (req: Request, res: Response): Promise<void> => {
            const id = getSignalIdParam(req);
            if (!id || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid signal ID" });
                return;
            }

            try {
                const history = await services.getSignalHistory(id);
                res.json({ success: true, history });
            } catch (error) {
                console.error("Fetching traffic signal history failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
    };
}

const handlers = createTrafficSignalHandlers({
    listSignals: async () => {
        const signals = await prisma.trafficSignal.findMany({
            orderBy: { createdAt: "desc" },
            include: {
                intersection: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        status: true,
                    },
                },
            },
        });

        return signals.map((signal) => toSignalPayload(signal));
    },
    getSignal: async (id) => {
        const signal = await prisma.trafficSignal.findUnique({
            where: { id },
            include: {
                intersection: {
                    select: {
                        id: true,
                        name: true,
                        location: true,
                        status: true,
                    },
                },
            },
        });

        return signal ? toSignalPayload(signal) : null;
    },
    updateSignalConfig: async (id, data, changedByUserId) => {
        const currentSignal = await prisma.trafficSignal.findUnique({ where: { id } });
        if (!currentSignal) {
            throw Object.assign(new Error("Traffic signal not found"), { code: "P2025" });
        }

        const previousConfig = JSON.stringify({
            status: currentSignal.status,
            greenDuration: currentSignal.greenDuration,
            yellowDuration: currentSignal.yellowDuration,
            redDuration: currentSignal.redDuration,
        });
        const nextConfig = JSON.stringify({
            status: data.status,
            greenDuration: data.greenDuration,
            yellowDuration: data.yellowDuration,
            redDuration: data.redDuration,
        });

        const updatedSignal = await prisma.$transaction(async (tx) => {
            const saved = await tx.trafficSignal.update({
                where: { id },
                data: {
                    status: data.status,
                    greenDuration: data.greenDuration,
                    yellowDuration: data.yellowDuration,
                    redDuration: data.redDuration,
                },
                include: {
                    intersection: {
                        select: {
                            id: true,
                            name: true,
                            location: true,
                            status: true,
                        },
                    },
                },
            });

            await tx.signalConfigHistory.create({
                data: {
                    signalId: id,
                    previousConfig,
                    newConfig: nextConfig,
                    changedByUserId: changedByUserId ?? null,
                },
            });

            return toSignalPayload(saved);
        });

        return updatedSignal;
    },
    getSignalHistory: async (signalId) => {
        const history = await prisma.signalConfigHistory.findMany({
            where: { signalId },
            orderBy: { createdAt: "desc" },
            include: {
                changedByUser: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return history.map((entry) => ({
            id: entry.id,
            signalId: entry.signalId,
            previousConfig: entry.previousConfig,
            newConfig: entry.newConfig,
            changedByUserId: entry.changedByUserId,
            createdAt: entry.createdAt,
            changedByUser: entry.changedByUser,
        }));
    },
});

export const listTrafficSignals = handlers.list;
export const getTrafficSignal = handlers.getOne;
export const updateTrafficSignalConfig = handlers.updateConfig;
export const getTrafficSignalHistory = handlers.getHistory;
