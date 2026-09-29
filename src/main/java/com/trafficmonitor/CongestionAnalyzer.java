package com.trafficmonitor;

/**
 * Converts a raw vehicle count against a road segment's known capacity into
 * a congestion percentage and a discrete {@link CongestionLevel}.
 *
 * This is the second core module: it sits between {@link VehicleCounter}
 * (raw data) and {@link TrafficSignalController} (the decision that acts
 * on the congestion level).
 */
public class CongestionAnalyzer {

    /** Discrete congestion bands used to drive signal-timing decisions. */
    public enum CongestionLevel { LOW, MODERATE, HIGH, SEVERE }

    private final int roadCapacity;

    /**
     * @param roadCapacity the maximum number of vehicles the monitored
     *                      road segment can hold before it is considered
     *                      fully congested
     * @throws IllegalArgumentException if roadCapacity is not positive
     */
    public CongestionAnalyzer(int roadCapacity) {
        if (roadCapacity <= 0) {
            throw new IllegalArgumentException("Road capacity must be positive");
        }
        this.roadCapacity = roadCapacity;
    }

    /**
     * Returns what percentage of the road's capacity is currently occupied.
     * A result above 100% means the road is over capacity.
     *
     * @throws IllegalArgumentException if currentVehicleCount is negative
     */
    public double calculateCongestionPercentage(int currentVehicleCount) {
        if (currentVehicleCount < 0) {
            throw new IllegalArgumentException("Vehicle count cannot be negative");
        }
        return ((double) currentVehicleCount / roadCapacity) * 100.0;
    }

    /**
     * Classifies the current occupancy into a congestion band:
     * LOW &lt; 40%, MODERATE &lt; 70%, HIGH &lt;= 100%, SEVERE &gt; 100%.
     */
    public CongestionLevel classify(int currentVehicleCount) {
        double percentage = calculateCongestionPercentage(currentVehicleCount);
        if (percentage < 40.0) {
            return CongestionLevel.LOW;
        } else if (percentage < 70.0) {
            return CongestionLevel.MODERATE;
        } else if (percentage <= 100.0) {
            return CongestionLevel.HIGH;
        } else {
            return CongestionLevel.SEVERE;
        }
    }

    public int getRoadCapacity() {
        return roadCapacity;
    }
}
