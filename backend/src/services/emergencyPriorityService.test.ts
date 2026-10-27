import assert from "node:assert/strict";
import test from "node:test";
import {
    buildActivationTransitions,
    buildRestorationTransitions,
    EmergencyPriorityError,
    isPriorityExpired,
    type SignalSnapshot,
} from "./emergencyPriorityService.js";

test("clears a conflicting green through yellow and red before granting priority green", () => {
    const signals: SignalSnapshot[] = [
        { id: "north", status: "GREEN" },
        { id: "east", status: "RED" },
    ];

    const transitions = buildActivationTransitions(signals, "east");

    assert.deepEqual(transitions, [
        { signalId: "north", status: "YELLOW" },
        { signalId: "north", status: "RED" },
        { signalId: "east", status: "GREEN" },
    ]);

    const states = new Map(signals.map((signal) => [signal.id, signal.status]));
    for (const transition of transitions) {
        if (transition.status === "GREEN") {
            assert.equal([...states.values()].filter((status) => status === "GREEN").length, 0);
        }
        states.set(transition.signalId, transition.status);
    }
});

test("does not bypass all-red when the requested approach is already yellow", () => {
    const transitions = buildActivationTransitions([
        { id: "north", status: "YELLOW" },
        { id: "east", status: "RED" },
    ], "north");

    assert.deepEqual(transitions, [
        { signalId: "north", status: "RED" },
        { signalId: "north", status: "GREEN" },
    ]);
});

test("rejects multiple existing green phases instead of activating priority", () => {
    assert.throws(
        () => buildActivationTransitions([
            { id: "north", status: "GREEN" },
            { id: "east", status: "GREEN" },
        ], "north"),
        (error: unknown) => error instanceof EmergencyPriorityError && error.code === "UNSAFE_SIGNAL_STATE",
    );
});

test("keeps an already-green requested approach without interrupting its phase", () => {
    assert.deepEqual(buildActivationTransitions([
        { id: "north", status: "GREEN" },
        { id: "east", status: "RED" },
    ], "north"), []);
});

test("restores normal green only after the priority phase clears through yellow and all-red", () => {
    const transitions = buildRestorationTransitions([
        { id: "north", status: "GREEN" },
        { id: "east", status: "RED" },
    ], [
        { id: "north", status: "RED" },
        { id: "east", status: "GREEN" },
    ]);

    assert.deepEqual(transitions, [
        { signalId: "north", status: "YELLOW" },
        { signalId: "north", status: "RED" },
        { signalId: "east", status: "GREEN" },
    ]);
});

test("restoration rejects conflicting active green phases", () => {
    assert.throws(
        () => buildRestorationTransitions([
            { id: "north", status: "GREEN" },
            { id: "east", status: "GREEN" },
        ], []),
        (error: unknown) => error instanceof EmergencyPriorityError && error.code === "UNSAFE_SIGNAL_STATE",
    );
});

test("times out active priority only after two minutes", () => {
    const now = new Date("2026-10-27T12:02:00.000Z");
    const activatedAt = new Date("2026-10-27T12:00:00.000Z");

    assert.equal(isPriorityExpired(activatedAt, now), true);
    assert.equal(isPriorityExpired(new Date(now.getTime() - 119_999), now), false);
    assert.equal(isPriorityExpired(null, now), false);
});
