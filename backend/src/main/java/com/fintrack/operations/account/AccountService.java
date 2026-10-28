package com.fintrack.operations.account;

import com.fintrack.common.ApiException;
import com.fintrack.operations.account.AccountDtos.AccountDto;
import com.fintrack.operations.account.AccountDtos.AccountRequest;
import com.fintrack.operations.recurring.RecurringTransactionRepository;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.user.sync.SyncEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional
public class AccountService {

    private final AccountRepository accounts;
    private final TransactionRepository transactions;
    private final RecurringTransactionRepository recurring;
    private final BalanceService balanceService;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<AccountDto> list(Long userId) {
        Map<Long, BigDecimal> balances = balanceService.balances(userId, LocalDate.now(clock));
        return accounts.findByUserIdOrderByArchivedAscCreatedAtAsc(userId).stream()
                .map(account -> AccountDto.from(account, balances.getOrDefault(account.getId(), account.getInitialBalance())))
                .toList();
    }

    public AccountDto create(Long userId, AccountRequest request) {
        Account account = new Account();
        account.setUserId(userId);
        account.setCreatedAt(clock.instant());
        apply(account, request);
        accounts.save(account);
        events.publishEvent(SyncEvent.of(userId, "accounts", "created", account.getId()));
        return toDto(userId, account);
    }

    public AccountDto update(Long userId, Long id, AccountRequest request) {
        Account account = requireOwned(userId, id);
        ApiException.checkVersion(request.version(), account.getVersion());
        apply(account, request);
        accounts.saveAndFlush(account);
        events.publishEvent(SyncEvent.of(userId, "accounts", "updated", account.getId()));
        return toDto(userId, account);
    }

    public void delete(Long userId, Long id) {
        Account account = requireOwned(userId, id);
        if (transactions.existsByAccountIdOrToAccountId(id, id) || recurring.existsByAccountId(id)) {
            throw ApiException.conflict("Рахунок має операції або регулярні платежі — архівуйте його замість видалення");
        }
        accounts.delete(account);
        events.publishEvent(SyncEvent.of(userId, "accounts", "deleted", id));
    }

    @Transactional(readOnly = true)
    public Account requireOwned(Long userId, Long accountId) {
        return accounts.findByIdAndUserId(accountId, userId)
                .orElseThrow(() -> ApiException.notFound("Рахунок не знайдено"));
    }

    private void apply(Account account, AccountRequest request) {
        account.setName(request.name().trim());
        account.setType(request.type());
        account.setInitialBalance(request.initialBalance().setScale(2, RoundingMode.HALF_UP));
        account.setColor(request.color());
        account.setArchived(request.archived());
    }

    private AccountDto toDto(Long userId, Account account) {
        BigDecimal balance = balanceService.balances(userId, LocalDate.now(clock))
                .getOrDefault(account.getId(), account.getInitialBalance());
        return AccountDto.from(account, balance);
    }
}
