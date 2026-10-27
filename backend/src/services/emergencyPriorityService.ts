import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../lib/prisma.js";

const DIRECTIONS = ["NORTH", "EAST", "SOUTH", "WEST"] as const;
const STATUSES = ["RED", "YELLOW", "GREEN"] as const;
const CLEARANCE_LIMIT_SECONDS = 30;
const ALL_RED_CLEARANCE_MS = 1_000;
const PRIORITY_TIMEOUT_MS = 120_000;

export type SignalDirection = (typeof DIRECTIONS)[number];
export type SignalStatus = (typeof STATUSES)[number];
export type SignalSnapshot = { id: string; status: SignalStatus };
export type SignalTransition = { signalId: string; status: SignalStatus };

export function isPriorityExpired(activatedAt: Date | null, now: Date): boolean {
    return activatedAt !== null && now.getTime() - activatedAt.getTime() >= PRIORITY_TIMEOUT_MS;
}

export class EmergencyPriorityError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
        this.name = "EmergencyPriorityError";
    }
}

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function buildActivationTransitions(
    signals: SignalSnapshot[],
    prioritySignalId: string,
): SignalTransition[] {
    const prioritySignal = signals.find((signal) => signal.id === prioritySignalId);
    if (!prioritySignal) {
        throw new EmergencyPriorityError("SIGNAL_NOT_FOUND", "The selected approach has no traffic signal.");
    }

    if (signals.filter((signal) => signal.status === "GREEN").length > 1) {
        throw new EmergencyPriorityError(
            "UNSAFE_SIGNAL_STATE",
            "Priority cannot be activated while conflicting green phases are present.",
        );
    }

    const transitions: SignalTransition[] = [];
    for (const signal of signals) {
        if (signal.id !== prioritySignalId && signal.status === "GREEN") {
            transitions.push({ signalId: signal.id, status: "YELLOW" });
        }
    }
    for (const signal of signals) {
        if (
            signal.status !== "RED"
            && !(signal.id === prioritySignalId && signal.status === "GREEN")
        ) {
            transitions.push({ signalId: signal.id, status: "RED" });
        }
    }
    if (prioritySignal.status !== "GREEN") {
        transitions.push({ signalId: prioritySignalId, status: "GREEN" });
    }

    return transitions;
}

export function buildRestorationTransitions(
    signals: SignalSnapshot[],
    previousStatuses: SignalSnapshot[],
): SignalTransition[] {
    if (signals.filter((signal) => signal.status === "GREEN").length > 1) {
        throw new EmergencyPriorityError(
            "UNSAFE_SIGNAL_STATE",
            "Normal operation cannot be restored while conflicting green phases are present.",
        );
    }

    const targetGreen = previousStatuses.find((snapshot) => snapshot.status === "GREEN");
    const transitions: SignalTransition[] = [];
    for (const signal of signals) {
        if (signal.status === "GREEN") {
            transitions.push({ signalId: signal.id, status: "YELLOW" });
        }
    }
    for (const signal of signals) {
        if (signal.status !== "RED") {
            transitions.push({ signalId: signal.id, status: "RED" });
        }
    }
    if (targetGreen) {
        if (!signals.some((signal) => signal.id === targetGreen.id)) {
            throw new EmergencyPriorityError("RESTORATION_STATE_INVALID", "The previously green signal no longer exists.");
        }
        transitions.push({ signalId: targetGreen.id, status: "GREEN" });
    }

    return transitions;
}

function decodePreviousStatuses(value: string | null): SignalSnapshot[] {
    if (!value) {
        throw new EmergencyPriorityError("RESTORATION_STATE_MISSING", "The saved normal signal state is missing.");
    }

    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
        throw new EmergencyPriorityError("RESTORATION_STATE_INVALID", "The saved normal signal state is invalid.");
    }

    const snapshots: SignalSnapshot[] = [];
    for (const entry of parsed) {
        if (
            typeof entry !== "object"
            || entry === null
            || !("id" in entry)
            || typeof entry.id !== "string"
            || !("status" in entry)
            || typeof entry.status !== "string"
            || !STATUSES.includes(entry.status as SignalStatus)
        ) {
            throw new EmergencyPriorityError("RESTORATION_STATE_INVALID", "The saved normal signal state is invalid.");
        }
        snapshots.push({ id: entry.id, status: entry.status as SignalStatus });
    }

    if (snapshots.filter((snapshot) => snapshot.status === "GREEN").length > 1) {
        throw new EmergencyPriorityError("RESTORATION_STATE_INVALID", "The saved signal state contains conflicting green phases.");
    }

    return snapshots;
}

async function setSignalStatus(
    tx: Prisma.TransactionClient,
    signal: {
        id: string;
        status: SignalStatus;
        greenDuration: number;
        yellowDuration: number;
        redDuration: number;
    },
    status: SignalStatus,
    changedByUserId: string | null,
): Promise<void> {
    if (signal.status === status) return;

    const previousConfig = JSON.stringify({
        status: signal.status,
        greenDuration: signal.greenDuration,
        yellowDuration: signal.yellowDuration,
        redDuration: signal.redDuration,
    });
    const updated = await tx.trafficSignal.update({
        where: { id: signal.id },
        data: { status },
    });
    await tx.signalConfigHistory.create({
        data: {
            signalId: signal.id,
            previousConfig,
            newConfig: JSON.stringify({
                status: updated.status,
                greenDuration: updated.greenDuration,
                yellowDuration: updated.yellowDuration,
                redDuration: updated.redDuration,
            }),
            changedByUserId,
        },
    });
    signal.status = status;
}

async function lockIntersection(
    tx: Prisma.TransactionClient,
    intersectionId: string,
): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${intersectionId}))`;
}

async function restoreNormalState(
    tx: Prisma.TransactionClient,
    signals: Array<{
        id: string;
        status: SignalStatus;
        greenDuration: number;
        yellowDuration: number;
        redDuration: number;
    }>,
    previousStatuses: SignalSnapshot[],
    changedByUserId: string | null,
): Promise<void> {
    const transitions = buildRestorationTransitions(
        signals.map(({ id, status }) => ({ id, status })),
        previousStatuses,
    );
    const prioritySignal = signals.find((signal) => signal.status === "GREEN");

    if (prioritySignal) {
        if (prioritySignal.yellowDuration > CLEARANCE_LIMIT_SECONDS) {
            throw new EmergencyPriorityError(
                "CLEARANCE_TOO_LONG",
                `The configured yellow clearance (${prioritySignal.yellowDuration}s) exceeds the 30-second simulation limit.`,
            );
        }
        await setSignalStatus(tx, prioritySignal, "YELLOW", changedByUserId);
        await wait(prioritySignal.yellowDuration * 1_000);
    }

    for (const transition of transitions) {
        if (transition.status === "RED") {
            const signal = signals.find((candidate) => candidate.id === transition.signalId)!;
            await setSignalStatus(tx, signal, "RED", changedByUserId);
        }
    }
    await wait(ALL_RED_CLEARANCE_MS);

    for (const transition of transitions) {
        if (transition.status === "GREEN") {
            const signal = signals.find((candidate) => candidate.id === transition.signalId);
            if (!signal) {
                throw new EmergencyPriorityError("RESTORATION_STATE_INVALID", "The previously green signal no longer exists.");
            }
            await setSignalStatus(tx, signal, "GREEN", changedByUserId);
        }
    }
}

async function markRestorationFailure(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown signal restoration failure.";
    try {
        await prisma.emergencyPriorityRequest.update({
            where: { id },
            data: { restorationError: message },
        });
    } catch (recordError) {
        console.error("Recording emergency priority restoration failure failed:", recordError);
    }
}

export const emergencyPriorityServices = {
    async getOptions() {
        const intersections = await prisma.intersection.findMany({
            where: { status: "ACTIVE" },
            orderBy: { name: "asc" },
            select: {
                id: true,
                name: true,
                location: true,
                signals: {
                    where: { direction: { not: null } },
                    orderBy: { direction: "asc" },
                    select: { id: true, direction: true, status: true },
                },
            },
        });
        return intersections;
    },

    async listRequests() {
        return prisma.emergencyPriorityRequest.findMany({
            orderBy: { requestedAt: "desc" },
            take: 100,
            include: {
                intersection: { select: { id: true, name: true, location: true } },
                signal: { select: { id: true, status: true } },
                requestedBy: { select: { id: true, name: true } },
                controlledBy: { select: { id: true, name: true } },
            },
        });
    },

    async createRequest(input: {
        intersectionId: string;
        direction: SignalDirection;
        vehicleType: "AMBULANCE" | "FIRE_ENGINE" | "POLICE_VEHICLE";
        requestedByUserId: string;
    }) {
        const [intersection, signal] = await Promise.all([
            prisma.intersection.findUnique({
                where: { id: input.intersectionId },
                select: { id: true, status: true },
            }),
            prisma.trafficSignal.findFirst({
                where: {
                    intersectionId: input.intersectionId,
                    direction: input.direction,
                },
                select: { id: true },
            }),
        ]);

        if (!intersection || intersection.status !== "ACTIVE") {
            throw new EmergencyPriorityError("INTERSECTION_NOT_FOUND", "Active intersection not found.");
        }
        if (!signal) {
            throw new EmergencyPriorityError("DIRECTION_NOT_CONFIGURED", "No traffic signal is configured for that approach.");
        }

        const now = new Date();
        return prisma.emergencyPriorityRequest.create({
            data: {
                intersectionId: input.intersectionId,
                signalId: signal.id,
                direction: input.direction,
                vehicleType: input.vehicleType,
                requestedByUserId: input.requestedByUserId,
                requestedAt: now,
                validatedAt: now,
            },
            include: {
                intersection: { select: { id: true, name: true, location: true } },
                signal: { select: { id: true, status: true } },
            },
        });
    },

    async activate(id: string, userId: string) {
        const existing = await prisma.emergencyPriorityRequest.findUnique({
            where: { id },
            select: { intersectionId: true },
        });
        if (!existing) {
            throw new EmergencyPriorityError("REQUEST_NOT_FOUND", "Emergency priority request not found.");
        }

        try {
            return await prisma.$transaction(async (tx) => {
                await lockIntersection(tx, existing.intersectionId);
                const request = await tx.emergencyPriorityRequest.findUnique({
                    where: { id },
                    include: { intersection: true, signal: true },
                });
                if (!request) {
                    throw new EmergencyPriorityError("REQUEST_NOT_FOUND", "Emergency priority request not found.");
                }
                if (request.status !== "REQUESTED") {
                    throw new EmergencyPriorityError("INVALID_TRANSITION", "Only a requested priority can be activated.");
                }
                if (request.intersection.status !== "ACTIVE") {
                    throw new EmergencyPriorityError("INTERSECTION_NOT_FOUND", "The intersection is not active.");
                }

                const signals = await tx.trafficSignal.findMany({
                    where: { intersectionId: request.intersectionId },
                    orderBy: { id: "asc" },
                });
                const selectedSignal = signals.find((signal) => signal.id === request.signalId);
                if (!selectedSignal || selectedSignal.direction !== request.direction) {
                    throw new EmergencyPriorityError("DIRECTION_NOT_CONFIGURED", "The requested approach is no longer configured.");
                }
                if (selectedSignal.yellowDuration > CLEARANCE_LIMIT_SECONDS) {
                    throw new EmergencyPriorityError(
                        "CLEARANCE_TOO_LONG",
                        `The selected approach's yellow clearance (${selectedSignal.yellowDuration}s) exceeds the 30-second simulation limit.`,
                    );
                }
                if (signals.filter((signal) => signal.status === "GREEN").length > 1) {
                    throw new EmergencyPriorityError(
                        "UNSAFE_SIGNAL_STATE",
                        "Priority cannot be activated while conflicting green phases are present.",
                    );
                }

                const transitions = buildActivationTransitions(
                    signals.map(({ id: signalId, status }) => ({ id: signalId, status })),
                    request.signalId,
                );
                const priorityWasGreen = selectedSignal.status === "GREEN";
                const clearanceSignals = signals.filter((signal) => (
                    signal.status !== "RED"
                    && !(signal.id === request.signalId && signal.status === "GREEN")
                ));
                const clearanceSeconds = Math.max(
                    0,
                    ...clearanceSignals.map((signal) => signal.yellowDuration),
                );
                if (clearanceSeconds > CLEARANCE_LIMIT_SECONDS) {
                    throw new EmergencyPriorityError(
                        "CLEARANCE_TOO_LONG",
                        `The configured yellow clearance (${clearanceSeconds}s) exceeds the 30-second simulation limit.`,
                    );
                }

                const previousStatuses = JSON.stringify(
                    signals.map(({ id: signalId, status }) => ({ id: signalId, status })),
                );
                for (const transition of transitions) {
                    if (transition.status === "YELLOW") {
                        const signal = signals.find((candidate) => candidate.id === transition.signalId)!;
                        await setSignalStatus(tx, signal, "YELLOW", userId);
                    }
                }
                if (clearanceSeconds > 0) await wait(clearanceSeconds * 1_000);

                for (const transition of transitions) {
                    if (transition.status === "RED") {
                        const signal = signals.find((candidate) => candidate.id === transition.signalId)!;
                        await setSignalStatus(tx, signal, "RED", userId);
                    }
                }
                if (!priorityWasGreen) {
                    await wait(ALL_RED_CLEARANCE_MS);
                }
                for (const transition of transitions) {
                    if (transition.status === "GREEN") {
                        const signal = signals.find((candidate) => candidate.id === transition.signalId)!;
                        await setSignalStatus(tx, signal, "GREEN", userId);
                    }
                }

                return tx.emergencyPriorityRequest.update({
                    where: { id },
                    data: {
                        status: "ACTIVE",
                        controlledByUserId: userId,
                        previousStatuses,
                        activatedAt: new Date(),
                        restorationError: null,
                    },
                    include: {
                        intersection: { select: { id: true, name: true, location: true } },
                        signal: { select: { id: true, status: true } },
                    },
                });
            }, { maxWait: 10_000, timeout: 60_000 });
        } catch (error) {
            if (error instanceof EmergencyPriorityError) throw error;
            console.error(`Activating emergency priority ${id} failed:`, error);
            throw error;
        }
    },

    async endRequest(id: string, userId: string | null, status: "COMPLETED" | "CANCELLED" | "TIMED_OUT") {
        const existing = await prisma.emergencyPriorityRequest.findUnique({
            where: { id },
            select: { intersectionId: true },
        });
        if (!existing) {
            throw new EmergencyPriorityError("REQUEST_NOT_FOUND", "Emergency priority request not found.");
        }

        try {
            return await prisma.$transaction(async (tx) => {
                await lockIntersection(tx, existing.intersectionId);
                const request = await tx.emergencyPriorityRequest.findUnique({
                    where: { id },
                });
                if (!request) {
                    throw new EmergencyPriorityError("REQUEST_NOT_FOUND", "Emergency priority request not found.");
                }
                if (request.status === "REQUESTED" && status === "CANCELLED") {
                    return tx.emergencyPriorityRequest.update({
                        where: { id },
                        data: { status, endedAt: new Date(), controlledByUserId: userId },
                    });
                }
                if (request.status !== "ACTIVE") {
                    throw new EmergencyPriorityError(
                        "INVALID_TRANSITION",
                        "Only an active priority can be completed, cancelled, or timed out.",
                    );
                }
                const previousStatuses = decodePreviousStatuses(request.previousStatuses);
                const signals = await tx.trafficSignal.findMany({
                    where: { intersectionId: request.intersectionId },
                    orderBy: { id: "asc" },
                });
                await restoreNormalState(tx, signals, previousStatuses, userId);

                return tx.emergencyPriorityRequest.update({
                    where: { id },
                    data: {
                        status,
                        endedAt: new Date(),
                        controlledByUserId: userId ?? request.controlledByUserId,
                        restorationError: null,
                    },
                    include: {
                        intersection: { select: { id: true, name: true, location: true } },
                        signal: { select: { id: true, status: true } },
                    },
                });
            }, { maxWait: 10_000, timeout: 60_000 });
        } catch (error) {
            if (
                error instanceof EmergencyPriorityError
                && ["REQUEST_NOT_FOUND", "INVALID_TRANSITION"].includes(error.code)
            ) {
                throw error;
            }
            await markRestorationFailure(id, error);
            throw error;
        }
    },

    async expireStaleRequests(): Promise<number> {
        const staleRequests = await prisma.emergencyPriorityRequest.findMany({
            where: {
                status: "ACTIVE",
                activatedAt: { lte: new Date(Date.now() - PRIORITY_TIMEOUT_MS) },
            },
            select: { id: true },
        });
        let expired = 0;
        for (const request of staleRequests) {
            try {
                await emergencyPriorityServices.endRequest(request.id, null, "TIMED_OUT");
                expired += 1;
            } catch (error) {
                console.error(`Emergency priority timeout restoration failed for ${request.id}:`, error);
            }
        }
        return expired;
    },
};

export function isSignalDirection(value: unknown): value is SignalDirection {
    return typeof value === "string" && DIRECTIONS.includes(value as SignalDirection);
}
