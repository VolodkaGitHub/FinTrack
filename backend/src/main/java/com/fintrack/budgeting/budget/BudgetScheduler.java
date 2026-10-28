package com.fintrack.budgeting.budget;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.YearMonth;

/** REQ-2.4: на початку кожного місяця відкриває нові бюджетні періоди з перенесенням або скиданням залишку. */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "fintrack.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class BudgetScheduler {

    private final BudgetService budgetService;
    private final Clock clock;

    @Scheduled(cron = "${fintrack.scheduling.budget-period-cron}", zone = "${fintrack.timezone}")
    public void openNewPeriods() {
        YearMonth month = YearMonth.now(clock);
        int opened = budgetService.openPeriods(month);
        log.info("Opened {} budget periods for {}", opened, month);
    }
}
