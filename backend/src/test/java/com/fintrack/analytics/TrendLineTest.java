package com.fintrack.analytics;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class TrendLineTest {

    @Test
    void fitsPerfectLine() {
        TrendLine line = TrendLine.fit(List.of(new BigDecimal("100"), new BigDecimal("150"), new BigDecimal("200")));
        assertThat(line.slope()).isCloseTo(50, within(1e-9));
        assertThat(line.intercept()).isCloseTo(100, within(1e-9));
        assertThat(line.at(3)).isEqualByComparingTo("250.00");
    }

    @Test
    void leastSquaresOnNoisyData() {
        TrendLine line = TrendLine.fit(List.of(new BigDecimal("10"), new BigDecimal("30"), new BigDecimal("20"), new BigDecimal("40")));
        // slope = (n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²) = (4·190 − 6·100) / (4·14 − 36) = 160 / 20 = 8
        assertThat(line.slope()).isCloseTo(8, within(1e-9));
        assertThat(line.intercept()).isCloseTo(13, within(1e-9));
    }

    @Test
    void handlesEmptyAndSingleValue() {
        assertThat(TrendLine.fit(List.of()).at(0)).isEqualByComparingTo("0");
        assertThat(TrendLine.fit(List.of(new BigDecimal("42"))).values(3))
                .allSatisfy(value -> assertThat(value).isEqualByComparingTo("42"));
    }
}
