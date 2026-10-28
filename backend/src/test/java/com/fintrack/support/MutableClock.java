package com.fintrack.support;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Годинник, яким керують тести: дозволяє «перемотати» застосунок у потрібну дату
 * (новий бюджетний місяць, день регулярного платежу, прострочене посилання). За замовчуванням — системний час.
 */
public class MutableClock extends Clock {

    private final ZoneId zone;
    private volatile Instant fixed;

    public MutableClock(ZoneId zone) {
        this.zone = zone;
    }

    /** «Сьогодні» = вказана дата, полудень за часовим поясом застосунку. */
    public void setDate(LocalDate date) {
        this.fixed = date.atTime(12, 0).atZone(zone).toInstant();
    }

    public void setInstant(Instant instant) {
        this.fixed = instant;
    }

    public void reset() {
        this.fixed = null;
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return Clock.fixed(instant(), zone);
    }

    @Override
    public Instant instant() {
        Instant current = fixed;
        return current != null ? current : Instant.now();
    }
}
