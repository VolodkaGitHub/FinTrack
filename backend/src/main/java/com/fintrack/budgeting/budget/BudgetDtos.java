package com.fintrack.budgeting.budget;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public final class BudgetDtos {

    private BudgetDtos() {
    }

    public enum BudgetState { OK, WARNING, EXCEEDED }

    public record BudgetRequest(
            @NotNull(message = "Оберіть категорію") Long categoryId,
            @NotNull(message = "Вкажіть суму бюджету") @DecimalMin(value = "0.01", message = "Сума має бути більшою за нуль")
            @Digits(integer = 13, fraction = 2, message = "Некоректна сума") BigDecimal amount,
            boolean rollover,
            @Min(value = 10, message = "Поріг від 10%") @Max(value = 100, message = "Поріг до 100%") Integer alertThreshold,
            Long version) {
    }

    /**
     * Стан бюджету за місяць (REQ-2.2): available = limit + carriedOver, remaining = available − spent.
     * Значення перераховуються при кожній зміні операцій, тож клієнт бачить залишок у реальному часі.
     */
    public record BudgetStatusDto(Long id, Long categoryId, BigDecimal amount, boolean rollover, int alertThreshold,
                                  String month, BigDecimal limit, BigDecimal carriedOver, BigDecimal available,
                                  BigDecimal spent, BigDecimal remaining, double percent, BudgetState state,
                                  Long version) {
    }
}
