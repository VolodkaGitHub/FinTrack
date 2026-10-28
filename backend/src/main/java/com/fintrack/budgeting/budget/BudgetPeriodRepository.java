package com.fintrack.budgeting.budget;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BudgetPeriodRepository extends JpaRepository<BudgetPeriod, Long> {

    Optional<BudgetPeriod> findByBudgetIdAndPeriodStart(Long budgetId, LocalDate periodStart);

    Optional<BudgetPeriod> findFirstByBudgetIdAndPeriodStartLessThanOrderByPeriodStartDesc(Long budgetId, LocalDate periodStart);

    List<BudgetPeriod> findByBudgetIdAndPeriodStartGreaterThanEqual(Long budgetId, LocalDate periodStart);
}
