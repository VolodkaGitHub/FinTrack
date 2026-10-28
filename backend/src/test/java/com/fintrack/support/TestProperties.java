package com.fintrack.support;

import com.fintrack.config.AppProperties;

import java.time.Duration;
import java.util.List;

/** Налаштування застосунку для модульних тестів без Spring-контексту. */
public final class TestProperties {

    private TestProperties() {
    }

    public static AppProperties create(boolean mailEnabled) {
        return new AppProperties(
                "http://localhost:5173",
                "Europe/Kyiv",
                List.of("http://localhost:5173"),
                new AppProperties.Jwt("0123456789abcdef0123456789abcdef", Duration.ofMinutes(15), Duration.ofDays(30)),
                new AppProperties.Mail(mailEnabled, "FinTrack <no-reply@fintrack.test>", Duration.ofHours(24)),
                new AppProperties.OAuth2(new AppProperties.Google("", "")),
                new AppProperties.Scheduling(false, "0 5 0 * * *", "0 10 0 1 * *"));
    }
}
