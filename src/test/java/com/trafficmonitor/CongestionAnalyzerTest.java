package com.trafficmonitor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static com.trafficmonitor.CongestionAnalyzer.CongestionLevel.*;

@DisplayName("CongestionAnalyzer")
class CongestionAnalyzerTest {

    private CongestionAnalyzer analyzer;

    @BeforeEach
    void setUp() {
        analyzer = new CongestionAnalyzer(100);
    }

    @Test
    @DisplayName("constructor throws when road capacity is zero")
    void constructorZeroCapacityThrows() {
        assertThrows(IllegalArgumentException.class, () -> new CongestionAnalyzer(0));
    }

    @Test
    @DisplayName("constructor throws when road capacity is negative")
    void constructorNegativeCapacityThrows() {
        assertThrows(IllegalArgumentException.class, () -> new CongestionAnalyzer(-10));
    }

    @Test
    @DisplayName("calculateCongestionPercentage computes correct percentage")
    void calculatesCorrectPercentage() {
        assertEquals(50.0, analyzer.calculateCongestionPercentage(50), 0.0001);
    }

    @Test
    @DisplayName("calculateCongestionPercentage throws on negative vehicle count")
    void negativeVehicleCountThrows() {
        assertThrows(IllegalArgumentException.class,
            () -> analyzer.calculateCongestionPercentage(-1));
    }

    @Test
    @DisplayName("zero vehicles classifies as LOW")
    void zeroVehiclesIsLow() {
        assertEquals(LOW, analyzer.classify(0));
    }

    @Test
    @DisplayName("39% occupancy classifies as LOW (just under the boundary)")
    void justBelowLowBoundary() {
        assertEquals(LOW, analyzer.classify(39));
    }

    @Test
    @DisplayName("40% occupancy classifies as MODERATE (boundary value)")
    void exactlyAtModerateBoundary() {
        assertEquals(MODERATE, analyzer.classify(40));
    }

    @Test
    @DisplayName("69% occupancy classifies as MODERATE (just under the boundary)")
    void justBelowHighBoundary() {
        assertEquals(MODERATE, analyzer.classify(69));
    }

    @Test
    @DisplayName("70% occupancy classifies as HIGH (boundary value)")
    void exactlyAtHighBoundary() {
        assertEquals(HIGH, analyzer.classify(70));
    }

    @Test
    @DisplayName("100% occupancy (full capacity) classifies as HIGH, not SEVERE")
    void exactlyAtCapacityIsHighNotSevere() {
        assertEquals(HIGH, analyzer.classify(100));
    }

    @Test
    @DisplayName("over-capacity vehicle count classifies as SEVERE")
    void overCapacityIsSevere() {
        assertEquals(SEVERE, analyzer.classify(101));
        assertEquals(200.0, analyzer.calculateCongestionPercentage(200), 0.0001);
    }

    @Test
    @DisplayName("getRoadCapacity returns the value supplied at construction")
    void getRoadCapacityReturnsConfiguredValue() {
        assertEquals(100, analyzer.getRoadCapacity());
    }
}
