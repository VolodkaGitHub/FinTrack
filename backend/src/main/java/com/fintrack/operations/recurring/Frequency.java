package com.fintrack.operations.recurring;

import java.time.LocalDate;
import java.time.MonthDay;
import java.time.YearMonth;

/** Періодичність регулярної операції. Місячні та річні дати прив'язані до дня старту без «дрейфу» (31 → 28/30 → 31). */
public enum Frequency {
    DAILY,
    WEEKLY,
    MONTHLY,
    YEARLY;

    public LocalDate next(LocalDate from, LocalDate anchor, int interval) {
        return switch (this) {
            case DAILY -> from.plusDays(interval);
            case WEEKLY -> from.plusWeeks(interval);
            case MONTHLY -> {
                YearMonth month = YearMonth.from(from).plusMonths(interval);
                yield month.atDay(Math.min(anchor.getDayOfMonth(), month.lengthOfMonth()));
            }
            case YEARLY -> MonthDay.from(anchor).atYear(from.getYear() + interval);
        };
    }
}
