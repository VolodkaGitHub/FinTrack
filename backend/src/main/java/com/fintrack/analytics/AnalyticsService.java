package com.fintrack.analytics;

import com.fintrack.analytics.AnalyticsDtos.CategoryShareDto;
import com.fintrack.analytics.AnalyticsDtos.MonthlyDynamicsDto;
import com.fintrack.analytics.AnalyticsDtos.MonthlyPointDto;
import com.fintrack.analytics.AnalyticsDtos.SummaryDto;
import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.operations.account.BalanceService;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.operations.transaction.TransactionRepository.CategoryTotal;
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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/** REQ-3.1 — розподіл за категоріями, REQ-3.2 — помісячна динаміка з трендовою лінією. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AnalyticsService {

    private final TransactionRepository transactions;
    private final CategoryService categories;
    private final BalanceService balances;
    private final Clock clock;

    public SummaryDto summary(Long userId, LocalDate from, LocalDate to) {
        Map<TransactionType, BigDecimal> totals = new EnumMap<>(TransactionType.class);
        for (DailyTotal row : transactions.sumByDay(userId, TransactionType.TRANSFER, from, to)) {
            totals.merge(row.getTxType(), row.getTotal(), BigDecimal::add);
        }
        BigDecimal income = totals.getOrDefault(TransactionType.INCOME, BigDecimal.ZERO);
        BigDecimal expense = totals.getOrDefault(TransactionType.EXPENSE, BigDecimal.ZERO);
        return new SummaryDto(from, to, income, expense, income.subtract(expense),
                transactions.countByUserIdAndOccurredOnBetween(userId, from, to),
                balances.totalBalance(userId, LocalDate.now(clock)));
    }

    /**
     * @param parentId null — групування за категоріями верхнього рівня (підкатегорії згортаються в батьківську);
     *                 інакше — деталізація витрат усередині вказаної категорії
     */
    public List<CategoryShareDto> categoryShares(Long userId, LocalDate from, LocalDate to, TransactionType type, Long parentId) {
        Map<Long, Category> cats = categories.mapForUser(userId);
        Set<Long> parentsWithChildren = cats.values().stream()
                .map(Category::getParentId)
                .filter(id -> id != null)
                .collect(Collectors.toSet());
        Map<Long, BigDecimal> grouped = new LinkedHashMap<>();
        for (CategoryTotal row : transactions.sumByCategory(userId, type, from, to)) {
            Category category = row.getCategoryId() == null ? null : cats.get(row.getCategoryId());
            Long key;
            if (parentId == null) {
                key = category == null ? null : category.getParentId() != null ? category.getParentId() : category.getId();
            } else {
                if (category == null || !(parentId.equals(category.getId()) || parentId.equals(category.getParentId()))) {
                    continue;
                }
                key = category.getId();
            }
            grouped.merge(key, row.getTotal(), BigDecimal::add);
        }
        BigDecimal total = grouped.values().stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        List<CategoryShareDto> result = new ArrayList<>();
        grouped.forEach((categoryId, amount) -> {
            Category category = categoryId == null ? null : cats.get(categoryId);
            String name = category == null ? "Без категорії"
                    : parentId != null && category.getId().equals(parentId) ? category.getName() + " (без підкатегорії)"
                    : category.getName();
            result.add(new CategoryShareDto(categoryId, name,
                    category == null ? "dots" : category.getIcon(),
                    category == null ? "#adb5bd" : category.getColor(),
                    amount, percent(amount, total),
                    parentId == null && category != null && parentsWithChildren.contains(category.getId())));
        });
        result.sort(Comparator.comparing(CategoryShareDto::amount).reversed());
        return result;
    }

    public MonthlyDynamicsDto monthly(Long userId, YearMonth from, YearMonth to) {
        List<YearMonth> months = new ArrayList<>();
        for (YearMonth month = from; !month.isAfter(to); month = month.plusMonths(1)) {
            months.add(month);
        }
        Map<YearMonth, BigDecimal> incomeByMonth = new HashMap<>();
        Map<YearMonth, BigDecimal> expenseByMonth = new HashMap<>();
        for (DailyTotal row : transactions.sumByDay(userId, TransactionType.TRANSFER, from.atDay(1), to.atEndOfMonth())) {
            YearMonth month = YearMonth.from(row.getOccurredOn());
            (row.getTxType() == TransactionType.INCOME ? incomeByMonth : expenseByMonth)
                    .merge(month, row.getTotal(), BigDecimal::add);
        }
        List<BigDecimal> incomes = months.stream().map(m -> incomeByMonth.getOrDefault(m, BigDecimal.ZERO)).toList();
        List<BigDecimal> expenses = months.stream().map(m -> expenseByMonth.getOrDefault(m, BigDecimal.ZERO)).toList();
        // місяці до початку обліку (без жодної операції) не мають впливати на тренд і середні значення
        int first = 0;
        while (first < months.size() && incomes.get(first).signum() == 0 && expenses.get(first).signum() == 0) {
            first++;
        }
        if (first == months.size()) {
            first = 0;
        }
        List<BigDecimal> activeIncomes = incomes.subList(first, months.size());
        List<BigDecimal> activeExpenses = expenses.subList(first, months.size());
        TrendLine incomeTrend = TrendLine.fit(activeIncomes);
        TrendLine expenseTrend = TrendLine.fit(activeExpenses);
        List<MonthlyPointDto> points = new ArrayList<>();
        for (int i = 0; i < months.size(); i++) {
            boolean tracked = i >= first;
            points.add(new MonthlyPointDto(months.get(i).toString(), incomes.get(i), expenses.get(i),
                    incomes.get(i).subtract(expenses.get(i)),
                    tracked ? incomeTrend.at(i - first).max(BigDecimal.ZERO) : null,
                    tracked ? expenseTrend.at(i - first).max(BigDecimal.ZERO) : null));
        }
        return new MonthlyDynamicsDto(points, incomeTrend.slopeAmount(), expenseTrend.slopeAmount(),
                average(activeIncomes), average(activeExpenses));
    }

    static double percent(BigDecimal part, BigDecimal total) {
        if (total.signum() == 0) {
            return 0;
        }
        return part.multiply(BigDecimal.valueOf(100)).divide(total, 1, RoundingMode.HALF_UP).doubleValue();
    }

    private static BigDecimal average(List<BigDecimal> values) {
        if (values.isEmpty()) {
            return BigDecimal.ZERO;
        }
        return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                .divide(BigDecimal.valueOf(values.size()), 2, RoundingMode.HALF_UP);
    }
}
