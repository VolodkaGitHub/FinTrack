package com.fintrack.budgeting.budget;

import com.fintrack.budgeting.budget.BudgetDtos.BudgetRequest;
import com.fintrack.budgeting.budget.BudgetDtos.BudgetState;
import com.fintrack.budgeting.budget.BudgetDtos.BudgetStatusDto;
import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.budgeting.category.CategoryType;
import com.fintrack.budgeting.notification.NotificationService;
import com.fintrack.budgeting.notification.NotificationType;
import com.fintrack.common.ApiException;
import com.fintrack.common.MoneyFormat;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.operations.transaction.TransactionType;
import com.fintrack.user.User;
import com.fintrack.user.UserRepository;
import com.fintrack.user.sync.SyncEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * REQ-2.2 — місячні бюджети з відстеженням залишку, REQ-2.3 — сповіщення про наближення/перевищення,
 * REQ-2.4 — перенесення або скидання невикористаного залишку на початку нового місяця.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class BudgetService {

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    private final BudgetRepository budgets;
    private final BudgetPeriodRepository periods;
    private final TransactionRepository transactions;
    private final CategoryService categories;
    private final NotificationService notifications;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public List<BudgetStatusDto> list(Long userId, YearMonth month) {
        Map<Long, Category> cats = categories.mapForUser(userId);
        return budgets.findByUserId(userId).stream()
                .filter(budget -> !month.isBefore(createdMonth(budget)))
                .sorted(Comparator.comparing(budget -> cats.containsKey(budget.getCategoryId())
                        ? cats.get(budget.getCategoryId()).getName() : "", String.CASE_INSENSITIVE_ORDER))
                .map(budget -> status(budget, month, cats))
                .toList();
    }

    public BudgetStatusDto create(Long userId, BudgetRequest request) {
        validateCategory(userId, request.categoryId());
        Budget budget = new Budget();
        budget.setUserId(userId);
        budget.setCategoryId(request.categoryId());
        budget.setCreatedAt(clock.instant());
        apply(budget, request);
        budgets.save(budget);
        events.publishEvent(SyncEvent.of(userId, "budgets", "created", budget.getId()));
        YearMonth current = YearMonth.now(clock);
        Map<Long, Category> cats = categories.mapForUser(userId);
        BudgetPeriod period = ensurePeriod(budget, current);
        evaluateAlerts(budget, period, current, cats);
        return status(budget, current, cats);
    }

    public BudgetStatusDto update(Long userId, Long id, BudgetRequest request) {
        Budget budget = require(userId, id);
        ApiException.checkVersion(request.version(), budget.getVersion());
        if (!budget.getCategoryId().equals(request.categoryId())) {
            validateCategory(userId, request.categoryId());
            budget.setCategoryId(request.categoryId());
        }
        boolean rolloverChanged = budget.isRollover() != request.rollover();
        apply(budget, request);
        YearMonth current = YearMonth.now(clock);
        Map<Long, Category> cats = categories.mapForUser(userId);
        // новий ліміт діє з поточного місяця, історія попередніх місяців не змінюється
        for (BudgetPeriod period : periods.findByBudgetIdAndPeriodStartGreaterThanEqual(id, current.atDay(1))) {
            period.setLimitAmount(budget.getAmount());
        }
        if (rolloverChanged) {
            recalculateCarry(budget, current, cats);
        }
        budgets.saveAndFlush(budget);
        BudgetPeriod period = ensurePeriod(budget, current);
        evaluateAlerts(budget, period, current, cats);
        events.publishEvent(SyncEvent.of(userId, "budgets", "updated", id));
        return status(budget, current, cats);
    }

    public void delete(Long userId, Long id) {
        Budget budget = require(userId, id);
        budgets.delete(budget);
        events.publishEvent(SyncEvent.of(userId, "budgets", "deleted", id));
    }

    /** Викликається після зміни витрат: перевіряє бюджети категорії та її батьківської категорії. */
    public void checkAlerts(Long userId, Long categoryId, LocalDate date) {
        if (categoryId == null || date == null) {
            return;
        }
        YearMonth month = YearMonth.from(date);
        if (month.isAfter(YearMonth.now(clock))) {
            return;
        }
        Map<Long, Category> cats = categories.mapForUser(userId);
        Category category = cats.get(categoryId);
        if (category == null) {
            return;
        }
        Set<Long> candidates = new HashSet<>();
        candidates.add(categoryId);
        if (category.getParentId() != null) {
            candidates.add(category.getParentId());
        }
        for (Budget budget : budgets.findByUserIdAndCategoryIdIn(userId, candidates)) {
            BudgetPeriod period = ensurePeriod(budget, month);
            if (period != null) {
                evaluateAlerts(budget, period, month, cats);
            }
            events.publishEvent(SyncEvent.of(userId, "budgets", "updated", budget.getId()));
        }
    }

    /**
     * REQ-2.4: відкриває періоди нового місяця для всіх бюджетів (запускається планувальником 1-го числа)
     * і повідомляє користувачів про перенесені залишки.
     */
    public int openPeriods(YearMonth month) {
        Map<Long, List<String>> carriedByUser = new LinkedHashMap<>();
        int opened = 0;
        for (Budget budget : budgets.findAll()) {
            if (month.isBefore(createdMonth(budget))
                    || periods.findByBudgetIdAndPeriodStart(budget.getId(), month.atDay(1)).isPresent()) {
                continue;
            }
            BudgetPeriod period = ensurePeriod(budget, month);
            opened++;
            if (period != null && period.getCarriedOver().signum() > 0) {
                Map<Long, Category> cats = categories.mapForUser(budget.getUserId());
                String name = cats.containsKey(budget.getCategoryId()) ? cats.get(budget.getCategoryId()).getName() : "Категорія";
                carriedByUser.computeIfAbsent(budget.getUserId(), k -> new ArrayList<>())
                        .add("«" + name + "» +" + MoneyFormat.format(period.getCarriedOver(), currency(budget.getUserId())));
            }
        }
        carriedByUser.forEach((userId, lines) -> notifications.notify(userId, NotificationType.BUDGET_ROLLOVER,
                "Новий бюджетний період: " + MoneyFormat.month(month),
                "Невикористаний залишок перенесено: " + String.join(", ", lines) + "."));
        return opened;
    }

    /**
     * Повертає (за потреби створює) період бюджету для місяця. Періоди створюються послідовно від останнього наявного,
     * тому перенесений залишок кожного місяця обчислюється з фактичних витрат попереднього.
     */
    BudgetPeriod ensurePeriod(Budget budget, YearMonth month) {
        YearMonth created = createdMonth(budget);
        if (month.isBefore(created) || month.isAfter(YearMonth.now(clock))) {
            return null;
        }
        Optional<BudgetPeriod> existing = periods.findByBudgetIdAndPeriodStart(budget.getId(), month.atDay(1));
        if (existing.isPresent()) {
            return existing.get();
        }
        BudgetPeriod last = periods
                .findFirstByBudgetIdAndPeriodStartLessThanOrderByPeriodStartDesc(budget.getId(), month.atDay(1))
                .orElse(null);
        YearMonth cursor = last == null ? created : YearMonth.from(last.getPeriodStart()).plusMonths(1);
        Map<Long, Category> cats = categories.mapForUser(budget.getUserId());
        while (!cursor.isAfter(month)) {
            BigDecimal carry = BigDecimal.ZERO;
            if (budget.isRollover() && last != null) {
                YearMonth previous = YearMonth.from(last.getPeriodStart());
                carry = last.available().subtract(spent(budget, previous, cats)).max(BigDecimal.ZERO);
            }
            BudgetPeriod period = new BudgetPeriod();
            period.setBudgetId(budget.getId());
            period.setPeriodStart(cursor.atDay(1));
            period.setLimitAmount(budget.getAmount());
            period.setCarriedOver(carry);
            last = periods.save(period);
            cursor = cursor.plusMonths(1);
        }
        return last;
    }

    private void recalculateCarry(Budget budget, YearMonth month, Map<Long, Category> cats) {
        periods.findByBudgetIdAndPeriodStart(budget.getId(), month.atDay(1)).ifPresent(period -> {
            BigDecimal carry = BigDecimal.ZERO;
            if (budget.isRollover()) {
                YearMonth previous = month.minusMonths(1);
                carry = periods.findByBudgetIdAndPeriodStart(budget.getId(), previous.atDay(1))
                        .map(prev -> prev.available().subtract(spent(budget, previous, cats)).max(BigDecimal.ZERO))
                        .orElse(BigDecimal.ZERO);
            }
            period.setCarriedOver(carry);
        });
    }

    private void evaluateAlerts(Budget budget, BudgetPeriod period, YearMonth month, Map<Long, Category> cats) {
        if (period == null) {
            return;
        }
        BigDecimal available = period.available();
        BigDecimal spent = spent(budget, month, cats);
        String name = cats.containsKey(budget.getCategoryId()) ? cats.get(budget.getCategoryId()).getName() : "Категорія";
        String currency = currency(budget.getUserId());
        boolean exceeded = spent.compareTo(available) > 0;
        boolean warning = !exceeded
                && spent.multiply(HUNDRED).compareTo(available.multiply(BigDecimal.valueOf(budget.getAlertThreshold()))) >= 0;
        if (exceeded) {
            if (!period.isExceededNotified()) {
                notifications.notify(budget.getUserId(), NotificationType.BUDGET_EXCEEDED,
                        "Перевищено бюджет «" + name + "»",
                        "Витрачено " + MoneyFormat.format(spent, currency) + " з " + MoneyFormat.format(available, currency)
                                + " за " + MoneyFormat.month(month) + ". Перевищення: "
                                + MoneyFormat.format(spent.subtract(available), currency) + ".");
                period.setExceededNotified(true);
                period.setWarningNotified(true);
            }
        } else if (warning) {
            period.setExceededNotified(false);
            if (!period.isWarningNotified()) {
                notifications.notify(budget.getUserId(), NotificationType.BUDGET_WARNING,
                        "Бюджет «" + name + "» майже вичерпано",
                        "Використано " + percent(spent, available) + "% (" + MoneyFormat.format(spent, currency) + " з "
                                + MoneyFormat.format(available, currency) + ") за " + MoneyFormat.month(month)
                                + ". Залишок: " + MoneyFormat.format(available.subtract(spent), currency) + ".");
                period.setWarningNotified(true);
            }
        } else {
            period.setWarningNotified(false);
            period.setExceededNotified(false);
        }
    }

    private BudgetStatusDto status(Budget budget, YearMonth month, Map<Long, Category> cats) {
        BudgetPeriod period = ensurePeriod(budget, month);
        BigDecimal limit = period != null ? period.getLimitAmount() : budget.getAmount();
        BigDecimal carried = period != null ? period.getCarriedOver() : BigDecimal.ZERO;
        BigDecimal available = limit.add(carried);
        BigDecimal spent = spent(budget, month, cats);
        double percent = percent(spent, available);
        BudgetState state = spent.compareTo(available) > 0 ? BudgetState.EXCEEDED
                : percent >= budget.getAlertThreshold() ? BudgetState.WARNING
                : BudgetState.OK;
        return new BudgetStatusDto(budget.getId(), budget.getCategoryId(), budget.getAmount(), budget.isRollover(),
                budget.getAlertThreshold(), month.toString(), limit, carried, available, spent,
                available.subtract(spent), percent, state, budget.getVersion());
    }

    /** Витрати бюджету за місяць: категорія разом з підкатегоріями. */
    private BigDecimal spent(Budget budget, YearMonth month, Map<Long, Category> cats) {
        Set<Long> ids = new HashSet<>();
        ids.add(budget.getCategoryId());
        cats.values().stream()
                .filter(c -> budget.getCategoryId().equals(c.getParentId()))
                .forEach(c -> ids.add(c.getId()));
        BigDecimal sum = transactions.sumForCategories(budget.getUserId(), TransactionType.EXPENSE, ids,
                month.atDay(1), month.atEndOfMonth());
        return sum == null ? BigDecimal.ZERO : sum;
    }

    private static double percent(BigDecimal spent, BigDecimal available) {
        if (available.signum() <= 0) {
            return spent.signum() > 0 ? 100.0 : 0.0;
        }
        return spent.multiply(HUNDRED).divide(available, 1, RoundingMode.HALF_UP).doubleValue();
    }

    private void validateCategory(Long userId, Long categoryId) {
        Category category = categories.requireOwned(userId, categoryId);
        if (category.getType() != CategoryType.EXPENSE) {
            throw ApiException.badRequest("Бюджет можна встановити лише для категорії витрат");
        }
        if (budgets.existsByUserIdAndCategoryId(userId, categoryId)) {
            throw ApiException.conflict("Для цієї категорії бюджет уже встановлено");
        }
    }

    private static void apply(Budget budget, BudgetRequest request) {
        budget.setAmount(request.amount().setScale(2, RoundingMode.HALF_UP));
        budget.setRollover(request.rollover());
        budget.setAlertThreshold(request.alertThreshold() == null ? 80 : request.alertThreshold());
    }

    private Budget require(Long userId, Long id) {
        return budgets.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Бюджет не знайдено"));
    }

    private YearMonth createdMonth(Budget budget) {
        return YearMonth.from(budget.getCreatedAt().atZone(clock.getZone()));
    }

    private String currency(Long userId) {
        return users.findById(userId).map(User::getCurrency).orElse("UAH");
    }
}
