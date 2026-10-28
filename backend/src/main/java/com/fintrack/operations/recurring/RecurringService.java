package com.fintrack.operations.recurring;

import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.budgeting.notification.NotificationService;
import com.fintrack.budgeting.notification.NotificationType;
import com.fintrack.common.ApiException;
import com.fintrack.common.MoneyFormat;
import com.fintrack.operations.account.Account;
import com.fintrack.operations.account.AccountService;
import com.fintrack.operations.recurring.RecurringDtos.ApplyRequest;
import com.fintrack.operations.recurring.RecurringDtos.RecurringDto;
import com.fintrack.operations.recurring.RecurringDtos.RecurringRequest;
import com.fintrack.operations.recurring.RecurringDtos.UpcomingPayment;
import com.fintrack.operations.transaction.Transaction;
import com.fintrack.operations.transaction.TransactionDtos.TransactionDto;
import com.fintrack.operations.transaction.TransactionService;
import com.fintrack.operations.transaction.TransactionType;
import com.fintrack.user.User;
import com.fintrack.user.UserRepository;
import com.fintrack.user.sync.SyncEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** REQ-1.3: регулярні операції — автоматичне створення, нагадування та швидке додавання одним натисканням. */
@Slf4j
@Service
@RequiredArgsConstructor
public class RecurringService {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final RecurringTransactionRepository recurring;
    private final AccountService accounts;
    private final CategoryService categories;
    private final TransactionService transactionService;
    private final NotificationService notifications;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    private final TransactionTemplate transactionTemplate;
    private final Clock clock;

    @Transactional(readOnly = true)
    public List<RecurringDto> list(Long userId) {
        LocalDate today = LocalDate.now(clock);
        return recurring.findByUserIdOrderByNextDateAscNameAsc(userId).stream()
                .map(r -> RecurringDto.from(r, today))
                .toList();
    }

    @Transactional
    public RecurringDto create(Long userId, RecurringRequest request) {
        RecurringTransaction template = new RecurringTransaction();
        template.setUserId(userId);
        template.setCreatedAt(clock.instant());
        apply(userId, template, request);
        template.setNextDate(request.startDate());
        recurring.save(template);
        LocalDate today = LocalDate.now(clock);
        if (template.isAutoCreate() && template.isActive() && !template.getNextDate().isAfter(today)) {
            generateDue(template, today);
        }
        events.publishEvent(SyncEvent.of(userId, "recurring", "created", template.getId()));
        return RecurringDto.from(template, today);
    }

    @Transactional
    public RecurringDto update(Long userId, Long id, RecurringRequest request) {
        RecurringTransaction template = require(userId, id);
        ApiException.checkVersion(request.version(), template.getVersion());
        boolean scheduleChanged = !template.getStartDate().equals(request.startDate())
                || template.getFrequency() != request.frequency()
                || template.getIntervalCount() != interval(request);
        apply(userId, template, request);
        LocalDate today = LocalDate.now(clock);
        if (scheduleChanged) {
            template.setNextDate(firstOnOrAfter(template, today));
            template.setRemindedFor(null);
        }
        recurring.saveAndFlush(template);
        events.publishEvent(SyncEvent.of(userId, "recurring", "updated", id));
        return RecurringDto.from(template, today);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        recurring.delete(require(userId, id));
        events.publishEvent(SyncEvent.of(userId, "recurring", "deleted", id));
    }

    /** Швидке додавання: операція з шаблону + зсув дати наступного платежу. */
    @Transactional
    public TransactionDto applyNow(Long userId, Long id, ApplyRequest request) {
        RecurringTransaction template = require(userId, id);
        LocalDate date = request != null && request.date() != null ? request.date() : LocalDate.now(clock);
        BigDecimal amount = request != null && request.amount() != null ? request.amount() : template.getAmount();
        Transaction transaction = transactionService.recordRecurring(userId, template.getType(), amount, date,
                template.getAccountId(), template.getCategoryId(), noteFor(template), template.getId(), "quick-add");
        if (template.isActive()) {
            advance(template);
        }
        events.publishEvent(SyncEvent.of(userId, "recurring", "updated", id));
        return TransactionDto.from(transaction);
    }

    /** Пропустити поточний платіж без створення операції. */
    @Transactional
    public RecurringDto skip(Long userId, Long id) {
        RecurringTransaction template = require(userId, id);
        advance(template);
        events.publishEvent(SyncEvent.of(userId, "recurring", "updated", id));
        return RecurringDto.from(template, LocalDate.now(clock));
    }

    /** Платежі в діапазоні [from, to]; прострочені ручні платежі позначаються overdue. */
    @Transactional(readOnly = true)
    public List<UpcomingPayment> upcoming(Long userId, LocalDate from, LocalDate to) {
        List<UpcomingPayment> result = new ArrayList<>();
        for (RecurringTransaction template : recurring.findByUserIdAndActiveTrue(userId)) {
            LocalDate date = template.getNextDate();
            if (date.isBefore(from)) {
                if (!template.isAutoCreate()) {
                    result.add(payment(template, date, true));
                }
                while (date.isBefore(from)) {
                    date = template.following(date);
                }
            }
            int guard = 0;
            while (!date.isAfter(to) && !template.isFinishedAt(date) && guard++ < 400) {
                result.add(payment(template, date, false));
                date = template.following(date);
            }
        }
        result.sort(Comparator.comparing(UpcomingPayment::date).thenComparing(UpcomingPayment::name));
        return result;
    }

    /** Викликається планувальником: кожен шаблон обробляється в окремій транзакції. */
    public int processDue(LocalDate today) {
        int created = 0;
        for (RecurringTransaction candidate : recurring.findByActiveTrueAndNextDateLessThanEqual(today)) {
            try {
                Integer count = transactionTemplate.execute(status -> processOne(candidate.getId(), today));
                created += count == null ? 0 : count;
            } catch (Exception e) {
                log.error("Failed to process recurring transaction {}", candidate.getId(), e);
            }
        }
        return created;
    }

    private int processOne(Long id, LocalDate today) {
        RecurringTransaction template = recurring.findById(id).orElse(null);
        if (template == null || !template.isActive() || template.getNextDate().isAfter(today)) {
            return 0;
        }
        if (template.isAutoCreate()) {
            return generateDue(template, today);
        }
        if (!template.getNextDate().equals(template.getRemindedFor())) {
            String currency = currency(template.getUserId());
            notifications.notify(template.getUserId(), NotificationType.RECURRING_DUE,
                    "Час сплатити: " + template.getName(),
                    "Регулярний платіж «" + template.getName() + "» на суму " + MoneyFormat.format(template.getAmount(), currency)
                            + " очікується з " + DATE.format(template.getNextDate())
                            + ". Додайте його одним натисканням у розділі «Регулярні платежі».");
            template.setRemindedFor(template.getNextDate());
        }
        return 0;
    }

    private int generateDue(RecurringTransaction template, LocalDate today) {
        int count = 0;
        BigDecimal total = BigDecimal.ZERO;
        LocalDate lastDate = null;
        while (template.isActive() && !template.getNextDate().isAfter(today)) {
            if (template.isFinishedAt(template.getNextDate())) {
                template.setActive(false);
                break;
            }
            transactionService.recordRecurring(template.getUserId(), template.getType(), template.getAmount(),
                    template.getNextDate(), template.getAccountId(), template.getCategoryId(), noteFor(template),
                    template.getId(), "recurring");
            count++;
            total = total.add(template.getAmount());
            lastDate = template.getNextDate();
            advance(template);
        }
        if (count > 0) {
            String currency = currency(template.getUserId());
            String sign = template.getType() == TransactionType.INCOME ? "+" : "−";
            String message = count == 1
                    ? "Автоматично записано " + sign + MoneyFormat.format(total, currency) + " за " + DATE.format(lastDate) + "."
                    : "Автоматично записано " + count + " операції на суму " + sign + MoneyFormat.format(total, currency)
                    + " (остання — " + DATE.format(lastDate) + ").";
            notifications.notify(template.getUserId(), NotificationType.RECURRING_CREATED,
                    "Регулярна операція: " + template.getName(), message);
            events.publishEvent(SyncEvent.of(template.getUserId(), "recurring", "updated", template.getId()));
        }
        return count;
    }

    private void advance(RecurringTransaction template) {
        LocalDate next = template.following(template.getNextDate());
        template.setNextDate(next);
        template.setRemindedFor(null);
        if (template.isFinishedAt(next)) {
            template.setActive(false);
        }
    }

    private static LocalDate firstOnOrAfter(RecurringTransaction template, LocalDate date) {
        LocalDate current = template.getStartDate();
        while (current.isBefore(date)) {
            current = template.following(current);
        }
        return current;
    }

    private void apply(Long userId, RecurringTransaction template, RecurringRequest request) {
        if (request.type() == TransactionType.TRANSFER) {
            throw ApiException.badRequest("Регулярною може бути лише операція доходу або витрати");
        }
        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw ApiException.badRequest("Дата завершення не може бути раніше дати початку");
        }
        Account account = accounts.requireOwned(userId, request.accountId());
        Category category = categories.requireOwned(userId, request.categoryId());
        if (!category.getType().name().equals(request.type().name())) {
            throw ApiException.badRequest("Категорія не відповідає типу операції");
        }
        template.setName(request.name().trim());
        template.setType(request.type());
        template.setAmount(request.amount().setScale(2, RoundingMode.HALF_UP));
        template.setAccountId(account.getId());
        template.setCategoryId(category.getId());
        template.setNote(StringUtils.hasText(request.note()) ? request.note().trim() : null);
        template.setFrequency(request.frequency());
        template.setIntervalCount(interval(request));
        template.setStartDate(request.startDate());
        template.setEndDate(request.endDate());
        template.setAutoCreate(request.autoCreate());
        template.setActive(request.active() == null || request.active());
    }

    private static int interval(RecurringRequest request) {
        return request.intervalCount() == null ? 1 : request.intervalCount();
    }

    private static String noteFor(RecurringTransaction template) {
        return template.getNote() != null ? template.getNote() : template.getName();
    }

    private static UpcomingPayment payment(RecurringTransaction template, LocalDate date, boolean overdue) {
        return new UpcomingPayment(template.getId(), template.getName(), template.getType(), template.getAmount(), date,
                template.getAccountId(), template.getCategoryId(), template.isAutoCreate(), overdue);
    }

    private RecurringTransaction require(Long userId, Long id) {
        return recurring.findByIdAndUserId(id, userId)
                .orElseThrow(() -> ApiException.notFound("Регулярну операцію не знайдено"));
    }

    private String currency(Long userId) {
        return users.findById(userId).map(User::getCurrency).orElse("UAH");
    }
}
