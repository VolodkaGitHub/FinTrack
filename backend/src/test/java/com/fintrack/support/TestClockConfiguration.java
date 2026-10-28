package com.fintrack.support;

import com.fintrack.config.AppProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import java.time.ZoneId;

/** У всіх тестових контекстах застосунок отримує керований годинник замість системного. */
@Configuration
public class TestClockConfiguration {

    @Bean
    @Primary
    public MutableClock testClock(AppProperties props) {
        return new MutableClock(ZoneId.of(props.timezone()));
    }
}
