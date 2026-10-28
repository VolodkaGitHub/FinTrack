package com.fintrack.operations.recurring;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;

/** Щоденне створення регулярних операцій; при старті «доганяє» пропущені дні (наприклад, після простою сервера). */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "fintrack.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class RecurringScheduler {

    private final RecurringService recurringService;
    private final Clock clock;

    @Scheduled(cron = "${fintrack.scheduling.recurring-cron}", zone = "${fintrack.timezone}")
    public void processDue() {
        int created = recurringService.processDue(LocalDate.now(clock));
        if (created > 0) {
            log.info("Created {} recurring transactions", created);
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void catchUpOnStartup() {
        processDue();
    }
}
