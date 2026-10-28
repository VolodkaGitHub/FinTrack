package com.fintrack.analytics.report;

import com.fintrack.analytics.AnalyticsService;
import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.common.ApiException;
import com.fintrack.operations.account.AccountDtos.AccountDto;
import com.fintrack.operations.account.AccountService;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.operations.transaction.TransactionType;
import com.fintrack.user.User;
import com.fintrack.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReportService {

    private final UserRepository users;
    private final TransactionRepository transactions;
    private final AnalyticsService analytics;
    private final AccountService accounts;
    private final CategoryService categories;
    private final Clock clock;

    public ReportData collect(Long userId, LocalDate from, LocalDate to) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Користувача не знайдено"));
        List<AccountDto> accountList = accounts.list(userId);
        Map<Long, String> accountNames = accountList.stream().collect(Collectors.toMap(AccountDto::id, AccountDto::name));
        Map<Long, Category> cats = categories.mapForUser(userId);
        List<ReportData.Row> rows = transactions.findByUserIdAndOccurredOnBetweenOrderByOccurredOnAscIdAsc(userId, from, to)
                .stream()
                .map(t -> new ReportData.Row(t.getOccurredOn(), t.getType(), t.getAmount(),
                        accountNames.getOrDefault(t.getAccountId(), ""),
                        t.getToAccountId() == null ? null : accountNames.getOrDefault(t.getToAccountId(), ""),
                        categoryLabel(cats, t.getCategoryId()), t.getNote()))
                .toList();
        return new ReportData(user.getDisplayName(), user.getEmail(), user.getCurrency(), from, to,
                ZonedDateTime.now(clock),
                analytics.summary(userId, from, to),
                analytics.categoryShares(userId, from, to, TransactionType.EXPENSE, null),
                analytics.categoryShares(userId, from, to, TransactionType.INCOME, null),
                analytics.monthly(userId, YearMonth.from(from), YearMonth.from(to)).points(),
                accountList, rows);
    }

    static String categoryLabel(Map<Long, Category> cats, Long categoryId) {
        Category category = categoryId == null ? null : cats.get(categoryId);
        if (category == null) {
            return "";
        }
        Category parent = category.getParentId() == null ? null : cats.get(category.getParentId());
        return parent == null ? category.getName() : parent.getName() + " / " + category.getName();
    }
}
