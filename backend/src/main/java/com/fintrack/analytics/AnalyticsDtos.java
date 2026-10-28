package com.fintrack.analytics;

import com.fintrack.operations.recurring.RecurringDtos.UpcomingPayment;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class AnalyticsDtos {

    private AnalyticsDtos() {
    }

    public record SummaryDto(LocalDate from, LocalDate to, BigDecimal income, BigDecimal expense, BigDecimal net,
                             long transactionCount, BigDecimal totalBalance) {
    }

    /** REQ-3.1: частка категорії у витратах (доходах) за період. */
    public record CategoryShareDto(Long categoryId, String name, String icon, String color, BigDecimal amount,
                                   double percent, boolean hasChildren) {
    }

    /** REQ-3.2: точка помісячної динаміки разом зі значеннями трендової лінії (null — до початку обліку). */
    public record MonthlyPointDto(String month, BigDecimal income, BigDecimal expense, BigDecimal net,
                                  BigDecimal incomeTrend, BigDecimal expenseTrend) {
    }

    /** slope — зміна за місяць згідно з лінійним трендом (метод найменших квадратів). */
    public record MonthlyDynamicsDto(List<MonthlyPointDto> points, BigDecimal incomeSlope, BigDecimal expenseSlope,
                                     BigDecimal averageIncome, BigDecimal averageExpense) {
    }

    public record ForecastPoint(LocalDate date, BigDecimal actual, BigDecimal projected) {
    }

    /** REQ-3.4: прогноз залишку коштів на кінець місяця. */
    public record ForecastDto(LocalDate today, LocalDate monthEnd, int daysInMonth, int daysElapsed, int daysLeft,
                              BigDecimal currentBalance, BigDecimal incomeToDate, BigDecimal expenseToDate,
                              BigDecimal averageDailyExpense, BigDecimal plannedIncome, BigDecimal plannedExpense,
                              BigDecimal recurringIncome, BigDecimal recurringExpense, BigDecimal projectedIncome,
                              BigDecimal projectedExpense, BigDecimal projectedEndBalance,
                              List<UpcomingPayment> upcoming, List<ForecastPoint> series) {
    }
}
