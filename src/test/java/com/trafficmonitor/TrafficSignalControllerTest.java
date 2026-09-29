package com.trafficmonitor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static com.trafficmonitor.TrafficSignalController.SignalState.*;
import static com.trafficmonitor.CongestionAnalyzer.CongestionLevel.*;

@DisplayName("TrafficSignalController")
class TrafficSignalControllerTest {

    private TrafficSignalController controller;

    @BeforeEach
    void setUp() {
        controller = new TrafficSignalController();
    }

    @Test
    @DisplayName("controller starts in the RED state")
    void startsInRedState() {
        assertEquals(RED, controller.getCurrentState());
    }

    @Test
    @DisplayName("green duration increases as congestion level increases")
    void greenDurationIncreasesWithCongestion() {
        assertAll(
            () -> assertEquals(20, controller.calculateGreenDuration(LOW)),
            () -> assertEquals(35, controller.calculateGreenDuration(MODERATE)),
            () -> assertEquals(50, controller.calculateGreenDuration(HIGH)),
            () -> assertEquals(65, controller.calculateGreenDuration(SEVERE))
        );
    }

    @Test
    @DisplayName("calculateGreenDuration throws on null congestion level")
    void calculateGreenDurationNullThrows() {
        assertThrows(IllegalArgumentException.class,
            () -> controller.calculateGreenDuration(null));
    }

    @Test
    @DisplayName("valid RED -> GREEN -> YELLOW -> RED cycle succeeds")
    void validFullCycleSucceeds() {
        controller.transitionTo(GREEN);
        assertEquals(GREEN, controller.getCurrentState());

        controller.transitionTo(YELLOW);
        assertEquals(YELLOW, controller.getCurrentState());

        controller.transitionTo(RED);
        assertEquals(RED, controller.getCurrentState());
    }

    @Test
    @DisplayName("transitionTo throws on null new state")
    void transitionToNullThrows() {
        assertThrows(IllegalArgumentException.class, () -> controller.transitionTo(null));
    }

    @Test
    @DisplayName("cannot skip YELLOW: RED directly to YELLOW is rejected")
    void redToYellowIsRejected() {
        assertThrows(IllegalStateException.class, () -> controller.transitionTo(YELLOW));
        // state must be unchanged after a rejected transition
        assertEquals(RED, controller.getCurrentState());
    }

    @Test
    @DisplayName("cannot reverse direction: GREEN back to RED is rejected")
    void greenToRedIsRejected() {
        controller.transitionTo(GREEN);
        assertThrows(IllegalStateException.class, () -> controller.transitionTo(RED));
        assertEquals(GREEN, controller.getCurrentState());
    }

    @Test
    @DisplayName("cannot stay in the same state: RED to RED is rejected")
    void sameStateTransitionIsRejected() {
        assertThrows(IllegalStateException.class, () -> controller.transitionTo(RED));
    }
}
