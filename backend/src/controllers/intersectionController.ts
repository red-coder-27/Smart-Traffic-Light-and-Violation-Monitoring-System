import type { Request, Response } from "express";
import prisma from "../lib/prisma.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTERSECTION_STATUSES = ["ACTIVE", "INACTIVE"] as const;

type IntersectionStatus = (typeof INTERSECTION_STATUSES)[number];
type IntersectionBody = {
    name?: unknown;
    location?: unknown;
    latitude?: unknown;
    longitude?: unknown;
    status?: unknown;
};

type IntersectionRecord = {
    id: string;
    name: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    status: IntersectionStatus;
    createdAt: Date;
    updatedAt: Date;
};

export type IntersectionServices = {
    createIntersection(data: {
        name: string;
        location: string;
        latitude?: number;
        longitude?: number;
        status?: IntersectionStatus;
    }): Promise<IntersectionRecord>;
    listIntersections(): Promise<IntersectionRecord[]>;
    getIntersection(id: string): Promise<IntersectionRecord | null>;
    updateIntersection(
        id: string,
        data: {
            name?: string;
            location?: string;
            latitude?: number;
            longitude?: number;
            status?: IntersectionStatus;
        },
    ): Promise<IntersectionRecord | null>;
    associateSignal?(intersectionId: string, signalId: string): Promise<boolean>;
};

function isDatabaseError(error: unknown, code: string): boolean {
    return typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === code;
}

function isValidCoordinate(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function getIdParam(req: Request): string | null {
    const id = req.params.id;
    return typeof id === "string" ? id : null;
}

function validateCreateBody(body: IntersectionBody): {
    name: string;
    location: string;
    latitude?: number;
    longitude?: number;
    status?: IntersectionStatus;
} | null {
    if (typeof body.name !== "string" || !body.name.trim()) {
        return null;
    }
    if (typeof body.location !== "string" || !body.location.trim()) {
        return null;
    }
    if (body.latitude !== undefined && !isValidCoordinate(body.latitude)) {
        return null;
    }
    if (body.longitude !== undefined && !isValidCoordinate(body.longitude)) {
        return null;
    }
    if (body.status !== undefined && !INTERSECTION_STATUSES.includes(body.status as IntersectionStatus)) {
        return null;
    }

    return {
        name: body.name.trim(),
        location: body.location.trim(),
        ...(body.latitude === undefined ? {} : { latitude: body.latitude }),
        ...(body.longitude === undefined ? {} : { longitude: body.longitude }),
        ...(body.status === undefined ? {} : { status: body.status as IntersectionStatus }),
    };
}

function validateUpdateBody(body: IntersectionBody): {
    name?: string;
    location?: string;
    latitude?: number;
    longitude?: number;
    status?: IntersectionStatus;
} | null {
    const data: {
        name?: string;
        location?: string;
        latitude?: number;
        longitude?: number;
        status?: IntersectionStatus;
    } = {};

    if ("name" in body) {
        if (typeof body.name !== "string" || !body.name.trim()) return null;
        data.name = body.name.trim();
    }
    if ("location" in body) {
        if (typeof body.location !== "string" || !body.location.trim()) return null;
        data.location = body.location.trim();
    }
    if ("latitude" in body) {
        if (!isValidCoordinate(body.latitude)) return null;
        data.latitude = body.latitude;
    }
    if ("longitude" in body) {
        if (!isValidCoordinate(body.longitude)) return null;
        data.longitude = body.longitude;
    }
    if ("status" in body) {
        if (!INTERSECTION_STATUSES.includes(body.status as IntersectionStatus)) return null;
        data.status = body.status as IntersectionStatus;
    }

    return Object.keys(data).length > 0 ? data : null;
}

export function createIntersectionHandlers(services: IntersectionServices) {
    return {
        create: async (req: Request, res: Response): Promise<void> => {
            const data = validateCreateBody((req.body ?? {}) as IntersectionBody);
            if (!data) {
                res.status(400).json({ success: false, message: "Invalid intersection data" });
                return;
            }

            try {
                const intersection = await services.createIntersection(data);
                res.status(201).json({ success: true, intersection });
            } catch (error) {
                if (isDatabaseError(error, "P2002")) {
                    res.status(409).json({
                        success: false,
                        message: "An intersection with the same name and location already exists",
                    });
                    return;
                }
                console.error("Creating intersection failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        list: async (_req: Request, res: Response): Promise<void> => {
            try {
                const intersections = await services.listIntersections();
                res.json({ success: true, intersections });
            } catch (error) {
                console.error("Listing intersections failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        getOne: async (req: Request, res: Response): Promise<void> => {
            const id = getIdParam(req);
            if (!id || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid intersection ID" });
                return;
            }

            try {
                const intersection = await services.getIntersection(id);
                if (!intersection) {
                    res.status(404).json({ success: false, message: "Intersection not found" });
                    return;
                }
                res.json({ success: true, intersection });
            } catch (error) {
                console.error("Fetching intersection failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        update: async (req: Request, res: Response): Promise<void> => {
            const id = getIdParam(req);
            if (!id || !UUID_PATTERN.test(id)) {
                res.status(400).json({ success: false, message: "Invalid intersection ID" });
                return;
            }

            const data = validateUpdateBody((req.body ?? {}) as IntersectionBody);
            if (!data) {
                res.status(400).json({ success: false, message: "Invalid intersection data" });
                return;
            }

            try {
                const intersection = await services.updateIntersection(id, data);
                if (!intersection) {
                    res.status(404).json({ success: false, message: "Intersection not found" });
                    return;
                }
                res.json({ success: true, intersection });
            } catch (error) {
                if (isDatabaseError(error, "P2002")) {
                    res.status(409).json({
                        success: false,
                        message: "An intersection with the same name and location already exists",
                    });
                    return;
                }
                console.error("Updating intersection failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
        associateSignal: async (req: Request, res: Response): Promise<void> => {
            const intersectionId = typeof req.params.id === "string" ? req.params.id : null;
            const signalId = typeof req.params.signalId === "string" ? req.params.signalId : null;
            if (!intersectionId || !signalId || !UUID_PATTERN.test(intersectionId) || !UUID_PATTERN.test(signalId)) {
                res.status(400).json({ success: false, message: "Invalid intersection or signal ID" });
                return;
            }
            if (!services.associateSignal) {
                res.status(500).json({ success: false, message: "Signal association is unavailable" });
                return;
            }

            try {
                const associated = await services.associateSignal(intersectionId, signalId);
                if (!associated) {
                    res.status(404).json({ success: false, message: "Intersection or traffic signal not found" });
                    return;
                }
                res.json({ success: true, message: "Traffic signal associated with intersection" });
            } catch (error) {
                console.error("Associating traffic signal failed:", error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        },
    };
}

const handlers = createIntersectionHandlers({
    createIntersection: (data) => prisma.intersection.create({ data }),
    listIntersections: () => prisma.intersection.findMany({ orderBy: { createdAt: "desc" } }),
    getIntersection: (id) => prisma.intersection.findUnique({ where: { id } }),
    updateIntersection: async (id, data) => {
        try {
            return await prisma.intersection.update({ where: { id }, data });
        } catch (error) {
            if (isDatabaseError(error, "P2025")) return null;
            throw error;
        }
    },
    associateSignal: async (intersectionId, signalId) => {
        const intersection = await prisma.intersection.findUnique({ where: { id: intersectionId }, select: { id: true } });
        const signal = await prisma.trafficSignal.findUnique({ where: { id: signalId }, select: { id: true } });
        if (!intersection || !signal) return false;
        await prisma.trafficSignal.update({
            where: { id: signalId },
            data: { intersectionId },
        });
        return true;
    },
});

export const createIntersection = handlers.create;
export const listIntersections = handlers.list;
export const getIntersection = handlers.getOne;
export const updateIntersection = handlers.update;
export const associateTrafficSignal = handlers.associateSignal;
