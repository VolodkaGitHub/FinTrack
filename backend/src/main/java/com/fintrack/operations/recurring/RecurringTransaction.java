package com.fintrack.operations.recurring;

import com.fintrack.operations.transaction.TransactionType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/** REQ-1.3: шаблон повторюваної операції (підписки, комунальні платежі, зарплата). */
@Entity
@Table(name = "recurring_transactions")
@Getter
@Setter
@NoArgsConstructor
public class RecurringTransaction {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TransactionType type;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(nullable = false)
    private Long accountId;

    @Column(nullable = false)
    private Long categoryId;

    private String note;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Frequency frequency;

    @Column(nullable = false)
    private int intervalCount = 1;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate nextDate;

    private LocalDate endDate;

    /** true — операція створюється автоматично в дату платежу; false — лише нагадування та швидке додавання. */
    private boolean autoCreate = true;

    private boolean active = true;

    /** Дата платежу, про яку вже надіслано нагадування (для ручних шаблонів). */
    private LocalDate remindedFor;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Version
    private Long version;

    public LocalDate following(LocalDate date) {
        return frequency.next(date, startDate, intervalCount);
    }

    public boolean isFinishedAt(LocalDate date) {
        return endDate != null && date.isAfter(endDate);
    }
}
