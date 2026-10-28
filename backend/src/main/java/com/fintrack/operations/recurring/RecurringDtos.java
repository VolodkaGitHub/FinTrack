package com.fintrack.operations.recurring;

import com.fintrack.operations.transaction.TransactionType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class RecurringDtos {

    private RecurringDtos() {
    }

    public record RecurringRequest(
            @NotBlank(message = "Вкажіть назву") @Size(max = 100, message = "Назва задовга") String name,
            @NotNull(message = "Оберіть тип") TransactionType type,
            @NotNull(message = "Вкажіть суму") @DecimalMin(value = "0.01", message = "Сума має бути більшою за нуль")
            @Digits(integer = 13, fraction = 2, message = "Некоректна сума") BigDecimal amount,
            @NotNull(message = "Оберіть рахунок") Long accountId,
            @NotNull(message = "Оберіть категорію") Long categoryId,
            @Size(max = 500) String note,
            @NotNull(message = "Оберіть періодичність") Frequency frequency,
            @Min(value = 1, message = "Інтервал від 1") @Max(value = 365, message = "Інтервал до 365") Integer intervalCount,
            @NotNull(message = "Вкажіть дату першого платежу") LocalDate startDate,
            LocalDate endDate,
            boolean autoCreate,
            Boolean active,
            Long version) {
    }

    public record RecurringDto(Long id, String name, TransactionType type, BigDecimal amount, Long accountId,
                               Long categoryId, String note, Frequency frequency, int intervalCount, LocalDate startDate,
                               LocalDate nextDate, LocalDate endDate, boolean autoCreate, boolean active, boolean due,
                               Long version) {
        public static RecurringDto from(RecurringTransaction r, LocalDate today) {
            return new RecurringDto(r.getId(), r.getName(), r.getType(), r.getAmount(), r.getAccountId(),
                    r.getCategoryId(), r.getNote(), r.getFrequency(), r.getIntervalCount(), r.getStartDate(),
                    r.getNextDate(), r.getEndDate(), r.isAutoCreate(), r.isActive(),
                    r.isActive() && !r.getNextDate().isAfter(today), r.getVersion());
        }
    }

    /** Швидке додавання операції з шаблону; дата й сума необов'язкові (за замовчуванням — сьогодні й сума шаблону). */
    public record ApplyRequest(LocalDate date,
                               @DecimalMin(value = "0.01") @Digits(integer = 13, fraction = 2) BigDecimal amount) {
    }

    /** Майбутній (або прострочений ручний) платіж — для дашборду та прогнозу (REQ-3.4). */
    public record UpcomingPayment(Long recurringId, String name, TransactionType type, BigDecimal amount,
                                  LocalDate date, Long accountId, Long categoryId, boolean autoCreate, boolean overdue) {
    }
}
