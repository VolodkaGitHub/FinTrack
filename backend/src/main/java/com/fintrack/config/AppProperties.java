package com.fintrack.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties(prefix = "fintrack")
public record AppProperties(
        String frontendUrl,
        String timezone,
        List<String> corsAllowedOrigins,
        Jwt jwt,
        Mail mail,
        OAuth2 oauth2,
        Scheduling scheduling) {

    public record Jwt(String secret, Duration accessTokenTtl, Duration refreshTokenTtl) {
    }

    public record Mail(boolean enabled, String from, Duration verificationTtl) {
    }

    public record OAuth2(Google google) {
    }

    public record Google(String clientId, String clientSecret) {
    }

    public record Scheduling(boolean enabled, String recurringCron, String budgetPeriodCron) {
    }
}
