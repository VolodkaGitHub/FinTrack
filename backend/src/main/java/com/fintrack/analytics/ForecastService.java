package com.fintrack.analytics;

import com.fintrack.analytics.AnalyticsDtos.ForecastDto;
import com.fintrack.analytics.AnalyticsDtos.ForecastPoint;
import com.fintrack.operations.account.BalanceService;
import com.fintrack.operations.recurring.RecurringDtos.UpcomingPayment;
import com.fintrack.operations.recurring.RecurringService;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.operations.transaction.TransactionRepository.DailyTotal;
import com.fintrack.operations.transaction.TransactionType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REQ-3.4: прогноз залишку коштів до кінця місяця.
 * <pre>
 * кінцевий баланс = поточний баланс
 *                 + заплановані (внесені наперед) операції місяця
 *                 + очікувані регулярні доходи − регулярні витрати
 *                 − середньоденні змінні витрати × днів до кінця місяця
 * </pre>
 * Середньоденні витрати рахуються без регулярних платежів (щоб не дублювати їх) і зважено поєднують
 * поточний місяць з історією попередніх трьох: на початку місяця більшу вагу має історія, наприкінці — поточна динаміка.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ForecastService {

    private static final int HISTORY_MONTHS = 3;

    private final TransactionRepository transactions;
    private final BalanceService balances;
    private final RecurringService recurring;
    private final Clock clock;

    public ForecastDto forecast(Long userId) {
        LocalDate today = LocalDate.now(clock);
        YearMonth month = YearMonth.from(today);
        LocalDate start = month.atDay(1);
        LocalDate end = month.atEndOfMonth();
        int daysInMonth = month.lengthOfMonth();
        int elapsed = today.getDayOfMonth();
        int left = daysInMonth - elapsed;

        BigDecimal balanceToday = balances.totalBalance(userId, today);

        Map<LocalDate, BigDecimal> dailyNet = new HashMap<>();
        BigDecimal incomeToDate = BigDecimal.ZERO;
        BigDecimal expenseToDate = BigDecimal.ZERO;
        BigDecimal plannedIncome = BigDecimal.ZERO;
        BigDecimal plannedExpense = BigDecimal.ZERO;
        for (DailyTotal row : transactions.sumByDay(userId, TransactionType.TRANSFER, start, end)) {
            boolean income = row.getTxType() == TransactionType.INCOME;
            dailyNet.merge(row.getOccurredOn(), income ? row.getTotal() : row.getTotal().negate(), BigDecimal::add);
            boolean past = !row.getOccurredOn().isAfter(today);
            if (income && past) {
                incomeToDate = incomeToDate.add(row.getTotal());
            } else if (income) {
                plannedIncome = plannedIncome.add(row.getTotal());
            } else if (past) {
                expenseToDate = expenseToDate.add(row.getTotal());
            } else {
                plannedExpense = plannedExpense.add(row.getTotal());
            }
        }

        BigDecimal dailyRate = averageDailyExpense(userId, month, today, elapsed, daysInMonth);

        List<UpcomingPayment> upcoming = left > 0 ? recurring.upcoming(userId, today.plusDays(1), end) : List.of();
        Map<LocalDate, BigDecimal> recurringByDay = new HashMap<>();
        BigDecimal recurringIncome = BigDecimal.ZERO;
        BigDecimal recurringExpense = BigDecimal.ZERO;
        for (UpcomingPayment payment : upcoming) {
            LocalDate date = payment.date().isAfter(today) ? payment.date() : today.plusDays(1);
            boolean income = payment.type() == TransactionType.INCOME;
            recurringByDay.merge(date, income ? payment.amount() : payment.amount().negate(), BigDecimal::add);
            if (income) {
                recurringIncome = recurringIncome.add(payment.amount());
            } else {
                recurringExpense = recurringExpense.add(payment.amount());
            }
        }

        BigDecimal variableProjection = dailyRate.multiply(BigDecimal.valueOf(left)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal projectedEnd = balanceToday.add(plannedIncome).subtract(plannedExpense)
                .add(recurringIncome).subtract(recurringExpense).subtract(variableProjection);

        List<ForecastPoint> series = new ArrayList<>();
        BigDecimal running = balanceToday.subtract(incomeToDate.subtract(expenseToDate));
        BigDecimal projected = balanceToday;
        for (int day = 1; day <= daysInMonth; day++) {
            LocalDate date = month.atDay(day);
            if (!date.isAfter(today)) {
                running = running.add(dailyNet.getOrDefault(date, BigDecimal.ZERO));
                series.add(new ForecastPoint(date, running, date.equals(today) ? running : null));
            } else {
                projected = projected.add(dailyNet.getOrDefault(date, BigDecimal.ZERO))
                        .add(recurringByDay.getOrDefault(date, BigDecimal.ZERO))
                        .subtract(dailyRate);
                series.add(new ForecastPoint(date, null, projected.setScale(2, RoundingMode.HALF_UP)));
            }
        }

        return new ForecastDto(today, end, daysInMonth, elapsed, left, balanceToday, incomeToDate, expenseToDate,
                dailyRate, plannedIncome, plannedExpense, recurringIncome, recurringExpense,
                incomeToDate.add(plannedIncome).add(recurringIncome),
                expenseToDate.add(plannedExpense).add(recurringExpense).add(variableProjection),
                projectedEnd.setScale(2, RoundingMode.HALF_UP), upcoming, series);
    }

    private BigDecimal averageDailyExpense(Long userId, YearMonth month, LocalDate today, int elapsed, int daysInMonth) {
        LocalDate start = month.atDay(1);
        BigDecimal currentRate = nz(transactions.sumNonRecurring(userId, TransactionType.EXPENSE, start, today))
                .divide(BigDecimal.valueOf(elapsed), 2, RoundingMode.HALF_UP);
        LocalDate first = transactions.firstDate(userId);
        if (first == null || !first.isBefore(start)) {
            return currentRate;
        }
        LocalDate historyStart = month.minusMonths(HISTORY_MONTHS).atDay(1);
        if (first.isAfter(historyStart)) {
            historyStart = first;
        }
        LocalDate historyEnd = start.minusDays(1);
        long historyDays = ChronoUnit.DAYS.between(historyStart, historyEnd) + 1;
        BigDecimal historyRate = nz(transactions.sumNonRecurring(userId, TransactionType.EXPENSE, historyStart, historyEnd))
                .divide(BigDecimal.valueOf(historyDays), 2, RoundingMode.HALF_UP);
        BigDecimal weight = BigDecimal.valueOf(elapsed).divide(BigDecimal.valueOf(daysInMonth), 4, RoundingMode.HALF_UP);
        return currentRate.multiply(weight)
                .add(historyRate.multiply(BigDecimal.ONE.subtract(weight)))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
