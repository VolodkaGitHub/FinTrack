package com.fintrack.operations.transaction;

import com.fintrack.budgeting.budget.BudgetService;
import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.common.ApiException;
import com.fintrack.operations.account.Account;
import com.fintrack.operations.account.AccountService;
import com.fintrack.operations.transaction.TransactionDtos.TransactionDto;
import com.fintrack.operations.transaction.TransactionDtos.TransactionFilter;
import com.fintrack.operations.transaction.TransactionDtos.TransactionPage;
import com.fintrack.operations.transaction.TransactionDtos.TransactionRequest;
import com.fintrack.user.sync.SyncEvent;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.EnumMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** REQ-1.1 (облік доходів і витрат), REQ-1.4 (пошук і фільтрація). */
@Service
@RequiredArgsConstructor
@Transactional
public class TransactionService {

    private static final Map<String, String> SORT_FIELDS = Map.of(
            "date", "occurredOn",
            "amount", "amount",
            "createdAt", "createdAt");

    private final TransactionRepository transactions;
    private final AccountService accounts;
    private final CategoryService categories;
    private final BudgetService budgets;
    private final ApplicationEventPublisher events;
    private final EntityManager entityManager;
    private final MeterRegistry meterRegistry;
    private final Clock clock;

    @Transactional(readOnly = true)
    public TransactionPage search(Long userId, TransactionFilter filter, int page, int size, String sort, String direction) {
        Set<Long> categoryIds = filter.categoryId() == null ? null : categories.withChildren(userId, filter.categoryId());
        Set<Long> textCategoryIds = null;
        if (StringUtils.hasText(filter.q())) {
            String q = filter.q().trim().toLowerCase(Locale.ROOT);
            textCategoryIds = categories.mapForUser(userId).values().stream()
                    .filter(c -> c.getName().toLowerCase(Locale.ROOT).contains(q))
                    .map(Category::getId)
                    .collect(Collectors.toSet());
        }
        Specification<Transaction> spec = TransactionSpecifications.matching(userId, filter, categoryIds, textCategoryIds);
        Sort.Direction dir = "asc".equalsIgnoreCase(direction) ? Sort.Direction.ASC : Sort.Direction.DESC;
        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200),
                Sort.by(dir, SORT_FIELDS.getOrDefault(sort, "occurredOn")).and(Sort.by(dir, "id")));
        Page<Transaction> result = transactions.findAll(spec, pageable);
        Map<TransactionType, BigDecimal> totals = totals(spec);
        return new TransactionPage(result.getContent().stream().map(TransactionDto::from).toList(),
                result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages(),
                totals.getOrDefault(TransactionType.INCOME, BigDecimal.ZERO),
                totals.getOrDefault(TransactionType.EXPENSE, BigDecimal.ZERO));
    }

    @Transactional(readOnly = true)
    public TransactionDto get(Long userId, Long id) {
        return TransactionDto.from(require(userId, id));
    }

    public TransactionDto create(Long userId, TransactionRequest request) {
        Transaction transaction = new Transaction();
        transaction.setUserId(userId);
        Instant now = clock.instant();
        transaction.setCreatedAt(now);
        transaction.setUpdatedAt(now);
        apply(userId, transaction, request);
        transactions.save(transaction);
        meterRegistry.counter("fintrack.transactions", "type", transaction.getType().name(), "source", "manual").increment();
        afterChange(userId, null, transaction, "created");
        return TransactionDto.from(transaction);
    }

    public TransactionDto update(Long userId, Long id, TransactionRequest request) {
        Transaction transaction = require(userId, id);
        ApiException.checkVersion(request.version(), transaction.getVersion());
        Snapshot before = Snapshot.of(transaction);
        apply(userId, transaction, request);
        transaction.setUpdatedAt(clock.instant());
        transactions.saveAndFlush(transaction);
        afterChange(userId, before, transaction, "updated");
        return TransactionDto.from(transaction);
    }

    public void delete(Long userId, Long id) {
        Transaction transaction = require(userId, id);
        Snapshot before = Snapshot.of(transaction);
        transactions.delete(transaction);
        transactions.flush();
        afterChange(userId, before, null, "deleted");
    }

    /** Створення операції з шаблону регулярного платежу (REQ-1.3). Шаблон уже провалідований під час збереження. */
    public Transaction recordRecurring(Long userId, TransactionType type, BigDecimal amount, LocalDate date,
                                       Long accountId, Long categoryId, String note, Long recurringId, String source) {
        Transaction transaction = new Transaction();
        Instant now = clock.instant();
        transaction.setUserId(userId);
        transaction.setType(type);
        transaction.setAmount(amount.setScale(2, RoundingMode.HALF_UP));
        transaction.setOccurredOn(date);
        transaction.setAccountId(accountId);
        transaction.setCategoryId(categoryId);
        transaction.setNote(note);
        transaction.setRecurringId(recurringId);
        transaction.setCreatedAt(now);
        transaction.setUpdatedAt(now);
        transactions.save(transaction);
        meterRegistry.counter("fintrack.transactions", "type", type.name(), "source", source).increment();
        afterChange(userId, null, transaction, "created");
        return transaction;
    }

    private void apply(Long userId, Transaction transaction, TransactionRequest request) {
        Account account = accounts.requireOwned(userId, request.accountId());
        if (account.isArchived() && !account.getId().equals(transaction.getAccountId())) {
            throw ApiException.badRequest("Рахунок «" + account.getName() + "» архівовано");
        }
        switch (request.type()) {
            case TRANSFER -> {
                if (request.toAccountId() == null) {
                    throw ApiException.badRequest("Оберіть рахунок зарахування");
                }
                if (request.toAccountId().equals(request.accountId())) {
                    throw ApiException.badRequest("Рахунки списання та зарахування мають відрізнятися");
                }
                Account target = accounts.requireOwned(userId, request.toAccountId());
                if (target.isArchived() && !target.getId().equals(transaction.getToAccountId())) {
                    throw ApiException.badRequest("Рахунок «" + target.getName() + "» архівовано");
                }
                transaction.setToAccountId(target.getId());
                transaction.setCategoryId(null);
            }
            case INCOME, EXPENSE -> {
                if (request.categoryId() == null) {
                    throw ApiException.badRequest("Оберіть категорію");
                }
                Category category = categories.requireOwned(userId, request.categoryId());
                if (!category.getType().name().equals(request.type().name())) {
                    throw ApiException.badRequest("Категорія не відповідає типу операції");
                }
                transaction.setCategoryId(category.getId());
                transaction.setToAccountId(null);
            }
        }
        transaction.setType(request.type());
        transaction.setAmount(request.amount().setScale(2, RoundingMode.HALF_UP));
        transaction.setOccurredOn(request.date());
        transaction.setAccountId(account.getId());
        transaction.setNote(StringUtils.hasText(request.note()) ? request.note().trim() : null);
    }

    /** Після зміни: перерахунок бюджетів (REQ-2.2/2.3) і розсилка події синхронізації на інші пристрої (REQ-4.2). */
    private void afterChange(Long userId, Snapshot before, Transaction after, String action) {
        if (before != null && before.type() == TransactionType.EXPENSE) {
            budgets.checkAlerts(userId, before.categoryId(), before.date());
        }
        if (after != null && after.getType() == TransactionType.EXPENSE
                && (before == null || before.type() != TransactionType.EXPENSE
                || !Objects.equals(before.categoryId(), after.getCategoryId())
                || !YearMonth.from(before.date()).equals(YearMonth.from(after.getOccurredOn())))) {
            budgets.checkAlerts(userId, after.getCategoryId(), after.getOccurredOn());
        }
        Long id = after != null ? after.getId() : before.id();
        events.publishEvent(SyncEvent.of(userId, "transactions", action, id));
    }

    private Map<TransactionType, BigDecimal> totals(Specification<Transaction> spec) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        Root<Transaction> root = query.from(Transaction.class);
        query.multiselect(root.get("type"), cb.sum(root.<BigDecimal>get("amount")))
                .where(spec.toPredicate(root, query, cb))
                .groupBy(root.get("type"));
        Map<TransactionType, BigDecimal> result = new EnumMap<>(TransactionType.class);
        for (Tuple row : entityManager.createQuery(query).getResultList()) {
            result.put(row.get(0, TransactionType.class), row.get(1, BigDecimal.class));
        }
        return result;
    }

    private Transaction require(Long userId, Long id) {
        return transactions.findByIdAndUserId(id, userId).orElseThrow(() -> ApiException.notFound("Операцію не знайдено"));
    }

    private record Snapshot(Long id, TransactionType type, Long categoryId, LocalDate date) {
        static Snapshot of(Transaction transaction) {
            return new Snapshot(transaction.getId(), transaction.getType(), transaction.getCategoryId(),
                    transaction.getOccurredOn());
        }
    }
}
