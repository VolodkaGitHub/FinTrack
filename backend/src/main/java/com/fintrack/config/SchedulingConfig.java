package com.fintrack.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Планувальник (регулярні операції, нові бюджетні періоди). Вимикається в тестах. */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "fintrack.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class SchedulingConfig {
}
