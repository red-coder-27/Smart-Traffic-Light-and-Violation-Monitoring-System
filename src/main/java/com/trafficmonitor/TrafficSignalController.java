package com.trafficmonitor;

import com.trafficmonitor.CongestionAnalyzer.CongestionLevel;

/**
 * Decides how long the green light should stay on given a congestion
 * level, and enforces a safe RED -&gt; GREEN -&gt; YELLOW -&gt; RED signal
 * state machine so the controller can never be commanded into an unsafe
 * transition (e.g. RED straight to YELLOW).
 *
 * This is the third core module of the Smart Traffic Monitoring System:
 * it is the component that actually acts on the output of
 * {@link CongestionAnalyzer}.
 */
public class TrafficSignalController {

    /** The physical state of the traffic light. */
    public enum SignalState { RED, YELLOW, GREEN }

    private SignalState currentState = SignalState.RED;

    public SignalState getCurrentState() {
        return currentState;
    }

    /**
     * Returns how many seconds the green phase should last for the given
     * congestion level. Heavier congestion gets a longer green phase so
     * more queued vehicles can clear the intersection.
     *
     * @throws IllegalArgumentException if level is null
     */
    public int calculateGreenDuration(CongestionLevel level) {
        if (level == null) {
            throw new IllegalArgumentException("Congestion level cannot be null");
        }
        switch (level) {
            case LOW:      return 20;
            case MODERATE: return 35;
            case HIGH:     return 50;
            case SEVERE:   return 65;
            default:
                throw new IllegalArgumentException("Unknown congestion level: " + level);
        }
    }

    /**
     * Attempts to move the signal to {@code newState}. Only the sequence
     * RED -&gt; GREEN -&gt; YELLOW -&gt; RED is allowed; any other request
     * is rejected so the controller can never skip the YELLOW warning
     * phase or reverse direction.
     *
     * @throws IllegalArgumentException if newState is null
     * @throws IllegalStateException if the transition is not permitted
     *         from the current state
     */
    public void transitionTo(SignalState newState) {
        if (newState == null) {
            throw new IllegalArgumentException("New state cannot be null");
        }
        boolean allowed;
        switch (currentState) {
            case RED:    allowed = (newState == SignalState.GREEN);  break;
            case GREEN:  allowed = (newState == SignalState.YELLOW); break;
            case YELLOW: allowed = (newState == SignalState.RED);    break;
            default:     allowed = false;
        }
        if (!allowed) {
            throw new IllegalStateException(
                "Invalid transition from " + currentState + " to " + newState);
        }
        currentState = newState;
    }
}
