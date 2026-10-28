package com.fintrack.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

/**
 * Єдиний годинник застосунку: «сьогодні» визначається в часовому поясі користувачів (Europe/Kyiv),
 * а в тестах його можна підмінити фіксованим.
 */
@Configuration
public class ClockConfig {

    @Bean
    public Clock clock(AppProperties props) {
        return Clock.system(ZoneId.of(props.timezone()));
    }
}
