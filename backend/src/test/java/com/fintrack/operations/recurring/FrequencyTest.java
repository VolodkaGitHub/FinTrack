package com.fintrack.operations.recurring;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class FrequencyTest {

    @Test
    void monthlyKeepsAnchorDayWithoutDrift() {
        LocalDate anchor = LocalDate.of(2026, 1, 31);
        LocalDate feb = Frequency.MONTHLY.next(anchor, anchor, 1);
        LocalDate mar = Frequency.MONTHLY.next(feb, anchor, 1);
        LocalDate apr = Frequency.MONTHLY.next(mar, anchor, 1);

        assertThat(feb).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(mar).isEqualTo(LocalDate.of(2026, 3, 31));
        assertThat(apr).isEqualTo(LocalDate.of(2026, 4, 30));
    }

    @Test
    void yearlyHandlesLeapDay() {
        LocalDate anchor = LocalDate.of(2024, 2, 29);
        LocalDate next = Frequency.YEARLY.next(anchor, anchor, 1);
        assertThat(next).isEqualTo(LocalDate.of(2025, 2, 28));
        assertThat(Frequency.YEARLY.next(LocalDate.of(2027, 2, 28), anchor, 1)).isEqualTo(LocalDate.of(2028, 2, 29));
    }

    @Test
    void weeklyAndDailyRespectInterval() {
        LocalDate start = LocalDate.of(2026, 10, 1);
        assertThat(Frequency.WEEKLY.next(start, start, 2)).isEqualTo(LocalDate.of(2026, 10, 15));
        assertThat(Frequency.DAILY.next(start, start, 3)).isEqualTo(LocalDate.of(2026, 10, 4));
    }
}
