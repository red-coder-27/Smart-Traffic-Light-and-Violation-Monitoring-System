package com.trafficmonitor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("VehicleCounter")
class VehicleCounterTest {

    private VehicleCounter counter;

    @BeforeEach
    void setUp() {
        counter = new VehicleCounter();
    }

    @Test
    @DisplayName("newly created counter has zero total count")
    void newCounterStartsAtZero() {
        assertEquals(0, counter.getTotalCount());
    }

    @Test
    @DisplayName("recordVehicle increments the count for that type only")
    void recordVehicleIncrementsCorrectType() {
        counter.recordVehicle(VehicleType.CAR);
        counter.recordVehicle(VehicleType.CAR);
        counter.recordVehicle(VehicleType.BUS);

        assertAll(
            () -> assertEquals(2, counter.getCount(VehicleType.CAR)),
            () -> assertEquals(1, counter.getCount(VehicleType.BUS)),
            () -> assertEquals(0, counter.getCount(VehicleType.TRUCK)),
            () -> assertEquals(3, counter.getTotalCount())
        );
    }

    @Test
    @DisplayName("recordVehicles adds a batch count in one call")
    void recordVehiclesBatchAddsCount() {
        counter.recordVehicles(VehicleType.TRUCK, 5);
        assertEquals(5, counter.getCount(VehicleType.TRUCK));
    }

    @Test
    @DisplayName("recordVehicle throws on null vehicle type")
    void recordVehicleNullTypeThrows() {
        assertThrows(IllegalArgumentException.class, () -> counter.recordVehicle(null));
    }

    @Test
    @DisplayName("recordVehicles throws on negative count")
    void recordVehiclesNegativeCountThrows() {
        assertThrows(IllegalArgumentException.class,
            () -> counter.recordVehicles(VehicleType.BIKE, -1));
    }

    @Test
    @DisplayName("recordVehicles accepts a boundary value of zero without error")
    void recordVehiclesZeroCountIsAllowed() {
        assertDoesNotThrow(() -> counter.recordVehicles(VehicleType.BIKE, 0));
        assertEquals(0, counter.getCount(VehicleType.BIKE));
    }

    @Test
    @DisplayName("getCount throws on null vehicle type")
    void getCountNullTypeThrows() {
        assertThrows(IllegalArgumentException.class, () -> counter.getCount(null));
    }

    @Test
    @DisplayName("averagePerMinute divides total count by elapsed minutes")
    void averagePerMinuteComputesCorrectly() {
        counter.recordVehicles(VehicleType.CAR, 30);
        assertEquals(6.0, counter.averagePerMinute(5), 0.0001);
    }

    @Test
    @DisplayName("averagePerMinute throws when elapsed minutes is zero")
    void averagePerMinuteZeroMinutesThrows() {
        assertThrows(IllegalArgumentException.class, () -> counter.averagePerMinute(0));
    }

    @Test
    @DisplayName("averagePerMinute throws when elapsed minutes is negative")
    void averagePerMinuteNegativeMinutesThrows() {
        assertThrows(IllegalArgumentException.class, () -> counter.averagePerMinute(-3));
    }

    @Test
    @DisplayName("reset clears all recorded counts back to zero")
    void resetClearsAllCounts() {
        counter.recordVehicles(VehicleType.CAR, 10);
        counter.recordVehicles(VehicleType.BUS, 4);

        counter.reset();

        assertAll(
            () -> assertEquals(0, counter.getTotalCount()),
            () -> assertEquals(0, counter.getCount(VehicleType.CAR)),
            () -> assertEquals(0, counter.getCount(VehicleType.BUS))
        );
    }
}
