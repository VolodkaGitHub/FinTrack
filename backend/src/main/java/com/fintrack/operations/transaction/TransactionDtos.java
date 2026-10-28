package com.fintrack.operations.transaction;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class TransactionDtos {

    private TransactionDtos() {
    }

    public record TransactionRequest(
            @NotNull(message = "Оберіть тип операції") TransactionType type,
            @NotNull(message = "Вкажіть суму") @DecimalMin(value = "0.01", message = "Сума має бути більшою за нуль")
            @Digits(integer = 13, fraction = 2, message = "Некоректна сума") BigDecimal amount,
            @NotNull(message = "Вкажіть дату") LocalDate date,
            @NotNull(message = "Оберіть рахунок") Long accountId,
            Long toAccountId,
            Long categoryId,
            @Size(max = 500, message = "Нотатка задовга (до 500 символів)") String note,
            Long version) {
    }

    public record TransactionDto(Long id, TransactionType type, BigDecimal amount, LocalDate date, Long accountId,
                                 Long toAccountId, Long categoryId, String note, Long recurringId,
                                 Instant createdAt, Instant updatedAt, Long version) {
        public static TransactionDto from(Transaction t) {
            return new TransactionDto(t.getId(), t.getType(), t.getAmount(), t.getOccurredOn(), t.getAccountId(),
                    t.getToAccountId(), t.getCategoryId(), t.getNote(), t.getRecurringId(), t.getCreatedAt(),
                    t.getUpdatedAt(), t.getVersion());
        }
    }

    /** REQ-1.4: критерії пошуку — період, тип, рахунок, категорія (з підкатегоріями), діапазон суми, текст. */
    public record TransactionFilter(LocalDate from, LocalDate to, TransactionType type, Long accountId, Long categoryId,
                                    BigDecimal minAmount, BigDecimal maxAmount, String q) {
    }

    public record TransactionPage(List<TransactionDto> content, int page, int size, long totalElements, int totalPages,
                                  BigDecimal totalIncome, BigDecimal totalExpense) {
    }
}
