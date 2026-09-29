package com.trafficmonitor;

import java.util.EnumMap;
import java.util.Map;

/**
 * Tracks vehicle counts detected by an intersection sensor, broken down by
 * vehicle type, and derives simple traffic-flow statistics from them.
 *
 * This is one of the three core modules of the Smart Traffic Monitoring
 * System: it feeds raw counts to {@link CongestionAnalyzer}, which in turn
 * drives {@link TrafficSignalController}.
 */
public class VehicleCounter {

    private final Map<VehicleType, Integer> counts = new EnumMap<>(VehicleType.class);

    public VehicleCounter() {
        for (VehicleType type : VehicleType.values()) {
            counts.put(type, 0);
        }
    }

    /** Records a single vehicle of the given type passing the sensor. */
    public void recordVehicle(VehicleType type) {
        if (type == null) {
            throw new IllegalArgumentException("Vehicle type cannot be null");
        }
        counts.put(type, counts.get(type) + 1);
    }

    /** Records {@code count} vehicles of the given type in one batch update. */
    public void recordVehicles(VehicleType type, int count) {
        if (type == null) {
            throw new IllegalArgumentException("Vehicle type cannot be null");
        }
        if (count < 0) {
            throw new IllegalArgumentException("Count cannot be negative");
        }
        counts.put(type, counts.get(type) + count);
    }

    /** Returns the running count for a single vehicle type. */
    public int getCount(VehicleType type) {
        if (type == null) {
            throw new IllegalArgumentException("Vehicle type cannot be null");
        }
        return counts.get(type);
    }

    /** Returns the total number of vehicles recorded across all types. */
    public int getTotalCount() {
        int total = 0;
        for (int c : counts.values()) {
            total += c;
        }
        return total;
    }

    /**
     * Returns the average number of vehicles recorded per minute over the
     * given observation window.
     *
     * @throws IllegalArgumentException if elapsedMinutes is not positive
     */
    public double averagePerMinute(int elapsedMinutes) {
        if (elapsedMinutes <= 0) {
            throw new IllegalArgumentException("Elapsed minutes must be positive");
        }
        return (double) getTotalCount() / elapsedMinutes;
    }

    /** Clears all counts back to zero, e.g. at the start of a new monitoring cycle. */
    public void reset() {
        for (VehicleType type : VehicleType.values()) {
            counts.put(type, 0);
        }
    }
}
