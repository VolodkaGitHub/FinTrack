package com.fintrack.operations.transaction;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface TransactionRepository extends JpaRepository<Transaction, Long>, JpaSpecificationExecutor<Transaction> {

    interface AccountTypeTotal {
        Long getAccountId();

        TransactionType getTxType();

        BigDecimal getTotal();
    }

    interface CategoryTotal {
        Long getCategoryId();

        BigDecimal getTotal();
    }

    interface DailyTotal {
        LocalDate getOccurredOn();

        TransactionType getTxType();

        BigDecimal getTotal();
    }

    Optional<Transaction> findByIdAndUserId(Long id, Long userId);

    List<Transaction> findByUserIdAndOccurredOnBetweenOrderByOccurredOnAscIdAsc(Long userId, LocalDate from, LocalDate to);

    List<Transaction> findByUserIdOrderByOccurredOnAscIdAsc(Long userId);

    boolean existsByAccountIdOrToAccountId(Long accountId, Long toAccountId);

    boolean existsByCategoryId(Long categoryId);

    long countByUserIdAndOccurredOnBetween(Long userId, LocalDate from, LocalDate to);

    @Query("""
            select t.accountId as accountId, t.type as txType, sum(t.amount) as total
            from Transaction t
            where t.userId = :userId and t.occurredOn <= :asOf
            group by t.accountId, t.type""")
    List<AccountTypeTotal> sumByAccountAndType(@Param("userId") Long userId, @Param("asOf") LocalDate asOf);

    @Query("""
            select t.toAccountId as accountId, t.type as txType, sum(t.amount) as total
            from Transaction t
            where t.userId = :userId and t.toAccountId is not null and t.occurredOn <= :asOf
            group by t.toAccountId, t.type""")
    List<AccountTypeTotal> sumIncomingTransfers(@Param("userId") Long userId, @Param("asOf") LocalDate asOf);

    @Query("""
            select t.categoryId as categoryId, sum(t.amount) as total
            from Transaction t
            where t.userId = :userId and t.type = :type and t.occurredOn between :from and :to
            group by t.categoryId""")
    List<CategoryTotal> sumByCategory(@Param("userId") Long userId, @Param("type") TransactionType type,
                                      @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select t.occurredOn as occurredOn, t.type as txType, sum(t.amount) as total
            from Transaction t
            where t.userId = :userId and t.type <> :excluded and t.occurredOn between :from and :to
            group by t.occurredOn, t.type""")
    List<DailyTotal> sumByDay(@Param("userId") Long userId, @Param("excluded") TransactionType excluded,
                              @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("""
            select sum(t.amount) from Transaction t
            where t.userId = :userId and t.type = :type and t.categoryId in :categoryIds
              and t.occurredOn between :from and :to""")
    BigDecimal sumForCategories(@Param("userId") Long userId, @Param("type") TransactionType type,
                                @Param("categoryIds") Collection<Long> categoryIds,
                                @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Витрати без регулярних платежів — база для прогнозу (REQ-3.4). */
    @Query("""
            select sum(t.amount) from Transaction t
            where t.userId = :userId and t.type = :type and t.recurringId is null
              and t.occurredOn between :from and :to""")
    BigDecimal sumNonRecurring(@Param("userId") Long userId, @Param("type") TransactionType type,
                               @Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select min(t.occurredOn) from Transaction t where t.userId = :userId")
    LocalDate firstDate(@Param("userId") Long userId);
}
