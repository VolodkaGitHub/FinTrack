package com.fintrack.budgeting.budget;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Стан бюджету в конкретному місяці: ліміт, перенесений залишок і прапорці надісланих сповіщень. */
@Entity
@Table(name = "budget_periods")
@Getter
@Setter
@NoArgsConstructor
public class BudgetPeriod {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, updatable = false)
    private Long budgetId;

    @Column(nullable = false, updatable = false)
    private LocalDate periodStart;

    @Column(nullable = false)
    private BigDecimal limitAmount;

    @Column(nullable = false)
    private BigDecimal carriedOver = BigDecimal.ZERO;

    private boolean warningNotified;

    private boolean exceededNotified;

    public BigDecimal available() {
        return limitAmount.add(carriedOver);
    }
}
