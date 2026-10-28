package com.fintrack.operations.account;

import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.operations.transaction.TransactionRepository.AccountTypeTotal;
import com.fintrack.operations.transaction.TransactionType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * REQ-1.2: окремі баланси рахунків. Баланс = початковий + доходи − витрати − перекази з рахунку + перекази на рахунок
 * (враховуються операції з датою не пізніше asOf — майбутні операції вважаються запланованими).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BalanceService {

    private final AccountRepository accounts;
    private final TransactionRepository transactions;

    public Map<Long, BigDecimal> balances(Long userId, LocalDate asOf) {
        List<Account> userAccounts = accounts.findByUserIdOrderByArchivedAscCreatedAtAsc(userId);
        Map<Long, BigDecimal> result = new HashMap<>();
        userAccounts.forEach(account -> result.put(account.getId(), account.getInitialBalance()));
        for (AccountTypeTotal row : transactions.sumByAccountAndType(userId, asOf)) {
            BigDecimal delta = row.getTxType() == TransactionType.INCOME ? row.getTotal() : row.getTotal().negate();
            result.merge(row.getAccountId(), delta, BigDecimal::add);
        }
        for (AccountTypeTotal row : transactions.sumIncomingTransfers(userId, asOf)) {
            if (row.getTxType() == TransactionType.TRANSFER) {
                result.merge(row.getAccountId(), row.getTotal(), BigDecimal::add);
            }
        }
        return result;
    }

    /** Сумарний баланс усіх неархівних рахунків. */
    public BigDecimal totalBalance(Long userId, LocalDate asOf) {
        Map<Long, BigDecimal> balances = balances(userId, asOf);
        return accounts.findByUserIdOrderByArchivedAscCreatedAtAsc(userId).stream()
                .filter(account -> !account.isArchived())
                .map(account -> balances.getOrDefault(account.getId(), BigDecimal.ZERO))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
