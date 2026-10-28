package com.fintrack.analytics;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

/** Лінійний тренд y = intercept + slope·x за методом найменших квадратів (x = 0..n−1). */
public record TrendLine(double slope, double intercept) {

    public static TrendLine fit(List<BigDecimal> values) {
        int n = values.size();
        if (n == 0) {
            return new TrendLine(0, 0);
        }
        if (n == 1) {
            return new TrendLine(0, values.get(0).doubleValue());
        }
        double sumX = 0;
        double sumY = 0;
        double sumXY = 0;
        double sumXX = 0;
        for (int x = 0; x < n; x++) {
            double y = values.get(x).doubleValue();
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumXX += (double) x * x;
        }
        double slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        double intercept = (sumY - slope * sumX) / n;
        return new TrendLine(slope, intercept);
    }

    public BigDecimal at(int x) {
        return BigDecimal.valueOf(intercept + slope * x).setScale(2, RoundingMode.HALF_UP);
    }

    public List<BigDecimal> values(int n) {
        List<BigDecimal> result = new ArrayList<>(n);
        for (int x = 0; x < n; x++) {
            result.add(at(x));
        }
        return result;
    }

    public BigDecimal slopeAmount() {
        return BigDecimal.valueOf(slope).setScale(2, RoundingMode.HALF_UP);
    }
}
