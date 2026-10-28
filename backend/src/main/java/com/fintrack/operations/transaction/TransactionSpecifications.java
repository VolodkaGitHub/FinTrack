package com.fintrack.operations.transaction;

import com.fintrack.operations.transaction.TransactionDtos.TransactionFilter;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;

/** REQ-1.4: динамічний пошук операцій за довільною комбінацією фільтрів. */
public final class TransactionSpecifications {

    private TransactionSpecifications() {
    }

    /**
     * @param categoryIds категорії фільтра разом із підкатегоріями (null — без фільтра)
     * @param textCategoryIds категорії, назва яких містить текст пошуку (пошук по нотатці АБО назві категорії)
     */
    public static Specification<Transaction> matching(Long userId, TransactionFilter filter,
                                                      Collection<Long> categoryIds, Collection<Long> textCategoryIds) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("userId"), userId));
            if (filter.from() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.<LocalDate>get("occurredOn"), filter.from()));
            }
            if (filter.to() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.<LocalDate>get("occurredOn"), filter.to()));
            }
            if (filter.type() != null) {
                predicates.add(cb.equal(root.get("type"), filter.type()));
            }
            if (filter.accountId() != null) {
                predicates.add(cb.or(
                        cb.equal(root.get("accountId"), filter.accountId()),
                        cb.equal(root.get("toAccountId"), filter.accountId())));
            }
            if (categoryIds != null) {
                predicates.add(root.get("categoryId").in(categoryIds));
            }
            if (filter.minAmount() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.<BigDecimal>get("amount"), filter.minAmount()));
            }
            if (filter.maxAmount() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.<BigDecimal>get("amount"), filter.maxAmount()));
            }
            if (StringUtils.hasText(filter.q())) {
                String pattern = "%" + escapeLike(filter.q().trim().toLowerCase(Locale.ROOT)) + "%";
                Predicate byNote = cb.like(cb.lower(root.<String>get("note")), pattern, '\\');
                predicates.add(textCategoryIds == null || textCategoryIds.isEmpty()
                        ? byNote
                        : cb.or(byNote, root.get("categoryId").in(textCategoryIds)));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String escapeLike(String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
