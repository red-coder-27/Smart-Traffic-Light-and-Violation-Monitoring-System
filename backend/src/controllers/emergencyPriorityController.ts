import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
    EmergencyPriorityError,
    emergencyPriorityServices,
    isSignalDirection,
    type SignalDirection,
} from "../services/emergencyPriorityService.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VEHICLE_TYPES = ["AMBULANCE", "FIRE_ENGINE", "POLICE_VEHICLE"] as const;
type VehicleType = (typeof VEHICLE_TYPES)[number];

export type EmergencyPriorityServices = {
    getOptions(): Promise<unknown[]>;
    listRequests(): Promise<unknown[]>;
    createRequest(input: {
        intersectionId: string;
        direction: SignalDirection;
        vehicleType: VehicleType;
        requestedByUserId: string;
    }): Promise<unknown>;
    activate(id: string, userId: string): Promise<unknown>;
    endRequest(id: string, userId: string | null, status: "COMPLETED" | "CANCELLED"): Promise<unknown>;
};

function getRequestId(req: Request): string | null {
    const id = req.params.id;
    return typeof id === "string" && UUID_PATTERN.test(id) ? id : null;
}

function getUserId(req: Request): string | null {
    return (req as AuthenticatedRequest).authenticatedUser?.id ?? null;
}

function sendError(res: Response, error: unknown, operation: string): void {
    if (error instanceof EmergencyPriorityError) {
        console.warn(`${operation} rejected: ${error.message}`);
        const statusCode = error.code === "REQUEST_NOT_FOUND" || error.code === "INTERSECTION_NOT_FOUND"
            ? 404
            : error.code === "FORBIDDEN"
                ? 403
                : error.code === "DIRECTION_NOT_CONFIGURED"
                    ? 400
                    : 409;
        res.status(statusCode).json({ success: false, message: error.message });
        return;
    }
    if (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "P2002"
    ) {
        console.warn(`${operation} rejected because an open intersection request already exists.`);
        res.status(409).json({
            success: false,
            message: "An open emergency priority request already exists for this intersection.",
        });
        return;
    }

    console.error(`${operation} failed:`, error);
    res.status(500).json({ success: false, message: "Unable to complete the emergency priority operation." });
}

async function endRequest(
    req: Request,
    res: Response,
    status: "COMPLETED" | "CANCELLED",
    services: EmergencyPriorityServices,
): Promise<void> {
    const id = getRequestId(req);
    const userId = getUserId(req);
    if (!id) {
        res.status(400).json({ success: false, message: "Invalid emergency priority request ID" });
        return;
    }
    if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
    }

    try {
        const request = await services.endRequest(id, userId, status);
        res.json({
            success: true,
            request,
            message: status === "COMPLETED"
                ? "Emergency vehicle passed and normal signal operation was restored."
                : "Emergency priority request cancelled; normal signal operation was restored where required.",
        });
    } catch (error) {
        sendError(res, error, status === "COMPLETED" ? "Completing emergency priority" : "Cancelling emergency priority");
    }
}

export function createEmergencyPriorityHandlers(services: EmergencyPriorityServices) {
    return {
        options: async (_req: Request, res: Response): Promise<void> => {
            try {
                res.json({ success: true, intersections: await services.getOptions() });
            } catch (error) {
                sendError(res, error, "Loading emergency priority options");
            }
        },
        list: async (_req: Request, res: Response): Promise<void> => {
            try {
                res.json({ success: true, requests: await services.listRequests() });
            } catch (error) {
                sendError(res, error, "Listing emergency priority requests");
            }
        },
        create: async (req: Request, res: Response): Promise<void> => {
            const userId = getUserId(req);
            if (!userId) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            const body = req.body as Record<string, unknown> | null;
            if (
                !body
                || typeof body.intersectionId !== "string"
                || !UUID_PATTERN.test(body.intersectionId)
                || !isSignalDirection(body.direction)
                || typeof body.vehicleType !== "string"
                || !VEHICLE_TYPES.includes(body.vehicleType as VehicleType)
            ) {
                console.warn("Rejected emergency priority request due to invalid operator input.");
                res.status(400).json({
                    success: false,
                    message: "Provide a valid intersectionId, direction (NORTH, EAST, SOUTH, WEST), and emergency vehicleType.",
                });
                return;
            }

            try {
                const request = await services.createRequest({
                    intersectionId: body.intersectionId,
                    direction: body.direction,
                    vehicleType: body.vehicleType as VehicleType,
                    requestedByUserId: userId,
                });
                res.status(201).json({
                    success: true,
                    request,
                    message: "Emergency priority request validated and recorded. Detection is simulated/manual.",
                });
            } catch (error) {
                sendError(res, error, "Creating emergency priority request");
            }
        },
        activate: async (req: Request, res: Response): Promise<void> => {
            const id = getRequestId(req);
            const userId = getUserId(req);
            if (!id) {
                res.status(400).json({ success: false, message: "Invalid emergency priority request ID" });
                return;
            }
            if (!userId) {
                res.status(401).json({ success: false, message: "Authentication required" });
                return;
            }

            try {
                const request = await services.activate(id, userId);
                res.json({ success: true, request, message: "Emergency priority simulation activated safely." });
            } catch (error) {
                sendError(res, error, "Activating emergency priority");
            }
        },
        complete: async (req: Request, res: Response): Promise<void> => {
            await endRequest(req, res, "COMPLETED", services);
        },
        cancel: async (req: Request, res: Response): Promise<void> => {
            await endRequest(req, res, "CANCELLED", services);
        },
    };
}

const handlers = createEmergencyPriorityHandlers(emergencyPriorityServices);
export const getEmergencyPriorityOptions = handlers.options;
export const listEmergencyPriorityRequests = handlers.list;
export const createEmergencyPriorityRequest = handlers.create;
export const activateEmergencyPriority = handlers.activate;
export const completeEmergencyPriority = handlers.complete;
export const cancelEmergencyPriority = handlers.cancel;
