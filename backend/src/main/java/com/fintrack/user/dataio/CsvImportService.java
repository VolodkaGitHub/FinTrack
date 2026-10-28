package com.fintrack.user.dataio;

import com.fintrack.budgeting.budget.BudgetService;
import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.budgeting.category.CategoryType;
import com.fintrack.budgeting.notification.NotificationService;
import com.fintrack.budgeting.notification.NotificationType;
import com.fintrack.common.ApiException;
import com.fintrack.operations.account.Account;
import com.fintrack.operations.account.AccountRepository;
import com.fintrack.operations.account.AccountService;
import com.fintrack.operations.account.AccountType;
import com.fintrack.operations.transaction.Transaction;
import com.fintrack.operations.transaction.TransactionRepository;
import com.fintrack.operations.transaction.TransactionType;
import com.fintrack.user.dataio.CsvParsing.Columns;
import com.fintrack.user.dataio.CsvParsing.Decoded;
import com.fintrack.user.dataio.ImportDtos.ImportOptions;
import com.fintrack.user.dataio.ImportDtos.ImportResult;
import com.fintrack.user.dataio.ImportDtos.ImportRowDto;
import com.fintrack.user.dataio.ImportDtos.RowStatus;
import com.fintrack.user.sync.SyncEvent;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** REQ-4.3: імпорт історії з CSV інших застосунків (з попереднім переглядом і захистом від дублікатів). */
@Service
@RequiredArgsConstructor
public class CsvImportService {

    private static final int MAX_ROWS = 50_000;
    private static final int PREVIEW_ROWS = 100;
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("9999999999999.99");
    private static final String DEFAULT_CATEGORY = "Інше";

    private final TransactionRepository transactions;
    private final AccountRepository accountRepository;
    private final AccountService accountService;
    private final CategoryService categoryService;
    private final BudgetService budgetService;
    private final NotificationService notifications;
    private final ApplicationEventPublisher events;
    private final MeterRegistry meterRegistry;
    private final Clock clock;

    @Transactional
    public ImportResult importCsv(Long userId, byte[] content, ImportOptions options) {
        if (content == null || content.length == 0) {
            throw ApiException.badRequest("Файл порожній");
        }
        Decoded decoded = CsvParsing.decode(content);
        char delimiter = CsvParsing.detectDelimiter(decoded.text());
        List<CSVRecord> records = parse(decoded.text(), delimiter);
        if (records.size() < 2) {
            throw ApiException.badRequest("У файлі немає рядків з операціями");
        }
        if (records.size() > MAX_ROWS + 1) {
            throw ApiException.badRequest("Забагато рядків: максимум " + MAX_ROWS + " операцій за один імпорт");
        }
        List<String> headers = records.get(0).toList();
        Columns columns = Columns.detect(headers);
        if (columns.date() < 0 || columns.amount() < 0) {
            throw ApiException.badRequest("Не знайдено колонок з датою та сумою. Перший рядок файлу має містити заголовки "
                    + "(наприклад: date, amount, category, account, note або Дата, Сума, Категорія, Рахунок, Опис)");
        }
        Account defaultAccount = options.defaultAccountId() == null ? null
                : accountService.requireOwned(userId, options.defaultAccountId());
        boolean needsDefaultAccount = columns.account() < 0 && defaultAccount == null;

        Lookups lookups = new Lookups(userId);
        List<ParsedRow> rows = new ArrayList<>();
        for (int i = 1; i < records.size(); i++) {
            rows.add(parseRow(records.get(i), columns));
        }

        Map<String, Integer> existing = options.skipDuplicates() ? existingKeys(userId, rows, lookups) : Map.of();
        Set<String> newAccounts = new LinkedHashSet<>();
        Set<String> newCategories = new LinkedHashSet<>();
        for (ParsedRow row : rows) {
            if (row.status != RowStatus.OK) {
                continue;
            }
            if (row.account == null && defaultAccount != null) {
                row.account = defaultAccount.getName();
            }
            validateReferences(row, lookups, options.createMissing(), newAccounts, newCategories);
            if (row.status == RowStatus.OK && options.skipDuplicates()) {
                String key = row.key();
                int count = existing.getOrDefault(key, 0);
                if (count > 0) {
                    existing.put(key, count - 1);
                    row.status = RowStatus.DUPLICATE;
                    row.message = "Така операція вже є";
                }
            }
        }

        int imported = options.dryRun() ? 0 : persist(userId, rows, lookups);
        List<ImportRowDto> dtos = rows.stream().map(ParsedRow::toDto).toList();
        return new ImportResult(options.dryRun(), decoded.encoding(), CsvParsing.delimiterName(delimiter),
                columns.describe(headers), rows.size(),
                (int) rows.stream().filter(r -> r.status == RowStatus.OK).count(),
                (int) rows.stream().filter(r -> r.status == RowStatus.DUPLICATE).count(),
                (int) rows.stream().filter(r -> r.status == RowStatus.ERROR).count(),
                imported, List.copyOf(newAccounts), List.copyOf(newCategories), needsDefaultAccount,
                dtos.stream().limit(PREVIEW_ROWS).toList(),
                dtos.stream().filter(r -> r.status() == RowStatus.ERROR).limit(PREVIEW_ROWS).toList());
    }

    private int persist(Long userId, List<ParsedRow> rows, Lookups lookups) {
        Instant now = clock.instant();
        YearMonth currentMonth = YearMonth.now(clock);
        List<Transaction> toSave = new ArrayList<>();
        Set<Long> currentMonthCategories = new LinkedHashSet<>();
        for (ParsedRow row : rows) {
            if (row.status != RowStatus.OK) {
                continue;
            }
            Transaction transaction = new Transaction();
            transaction.setUserId(userId);
            transaction.setType(row.type);
            transaction.setAmount(row.amount);
            transaction.setOccurredOn(row.date);
            transaction.setAccountId(lookups.account(row.account).getId());
            if (row.type == TransactionType.TRANSFER) {
                transaction.setToAccountId(lookups.account(row.toAccount).getId());
            } else {
                Category category = lookups.category(row.type, row.category, row.subcategory);
                transaction.setCategoryId(category.getId());
                if (row.type == TransactionType.EXPENSE && YearMonth.from(row.date).equals(currentMonth)) {
                    currentMonthCategories.add(category.getId());
                }
            }
            transaction.setNote(row.note);
            transaction.setCreatedAt(now);
            transaction.setUpdatedAt(now);
            toSave.add(transaction);
        }
        transactions.saveAll(toSave);
        transactions.flush();
        meterRegistry.counter("fintrack.import.rows").increment(toSave.size());
        // сповіщення про бюджети — лише за поточний місяць, щоб імпорт історії не генерував застарілих попереджень
        currentMonthCategories.forEach(categoryId -> budgetService.checkAlerts(userId, categoryId, LocalDate.now(clock)));
        if (!toSave.isEmpty()) {
            notifications.notify(userId, NotificationType.IMPORT_COMPLETED, "Імпорт завершено",
                    "Додано операцій: " + toSave.size() + ". Нових рахунків: " + lookups.createdAccounts
                            + ", нових категорій: " + lookups.createdCategories + ".");
        }
        events.publishEvent(SyncEvent.of(userId, "transactions", "imported", null));
        if (lookups.createdAccounts > 0) {
            events.publishEvent(SyncEvent.of(userId, "accounts", "created", null));
        }
        if (lookups.createdCategories > 0) {
            events.publishEvent(SyncEvent.of(userId, "categories", "created", null));
        }
        return toSave.size();
    }

    private static List<CSVRecord> parse(String text, char delimiter) {
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setDelimiter(delimiter)
                .setIgnoreEmptyLines(true)
                .setIgnoreSurroundingSpaces(true)
                .setTrim(true)
                .build();
        try {
            return format.parse(new StringReader(text)).getRecords();
        } catch (IOException | RuntimeException e) {
            throw ApiException.badRequest("Не вдалося прочитати CSV: " + e.getMessage());
        }
    }

    private static ParsedRow parseRow(CSVRecord record, Columns columns) {
        ParsedRow row = new ParsedRow(record.getRecordNumber());
        try {
            row.note = truncate(value(record, columns.note()), 500);
            row.account = value(record, columns.account());
            row.toAccount = value(record, columns.toAccount());
            row.category = value(record, columns.category());
            row.subcategory = value(record, columns.subcategory());
            String date = value(record, columns.date());
            if (date == null) {
                throw new IllegalArgumentException("порожня дата");
            }
            row.date = CsvParsing.parseDate(date);
            BigDecimal amount = CsvParsing.parseAmount(value(record, columns.amount()));
            if (amount.signum() == 0) {
                throw new IllegalArgumentException("нульова сума");
            }
            TransactionType type = columns.type() >= 0 ? CsvParsing.parseType(value(record, columns.type())) : null;
            row.type = type != null ? type : amount.signum() < 0 ? TransactionType.EXPENSE : TransactionType.INCOME;
            row.amount = amount.abs().setScale(2, RoundingMode.HALF_UP);
            if (row.amount.compareTo(MAX_AMOUNT) > 0) {
                throw new IllegalArgumentException("завелика сума");
            }
            if (row.type == TransactionType.TRANSFER && row.toAccount == null) {
                throw new IllegalArgumentException("для переказу потрібна колонка «рахунок зарахування»");
            }
        } catch (IllegalArgumentException e) {
            row.status = RowStatus.ERROR;
            row.message = capitalize(e.getMessage());
        }
        return row;
    }

    private static void validateReferences(ParsedRow row, Lookups lookups, boolean createMissing,
                                           Set<String> newAccounts, Set<String> newCategories) {
        if (row.account == null) {
            row.fail("Не вказано рахунок — оберіть рахунок за замовчуванням");
            return;
        }
        for (String name : row.type == TransactionType.TRANSFER ? List.of(row.account, row.toAccount) : List.of(row.account)) {
            if (lookups.findAccount(name) == null) {
                if (!createMissing) {
                    row.fail("Рахунок «" + name + "» не знайдено");
                    return;
                }
                newAccounts.add(name);
            }
        }
        if (row.type != TransactionType.TRANSFER) {
            CategoryType type = CategoryType.valueOf(row.type.name());
            String parentName = row.category != null ? row.category : DEFAULT_CATEGORY;
            Category parent = lookups.findCategory(type, null, parentName);
            String label = (type == CategoryType.INCOME ? "Дохід: " : "Витрата: ") + parentName;
            if (parent == null) {
                if (!createMissing) {
                    row.fail("Категорію «" + parentName + "» не знайдено");
                    return;
                }
                newCategories.add(label);
            }
            if (row.subcategory != null && (parent == null || lookups.findCategory(type, parent.getId(), row.subcategory) == null)) {
                if (!createMissing) {
                    row.fail("Підкатегорію «" + row.subcategory + "» не знайдено");
                    return;
                }
                newCategories.add(label + " / " + row.subcategory);
            }
        }
    }

    private Map<String, Integer> existingKeys(Long userId, List<ParsedRow> rows, Lookups lookups) {
        LocalDate min = rows.stream().filter(r -> r.date != null).map(r -> r.date).min(LocalDate::compareTo).orElse(null);
        LocalDate max = rows.stream().filter(r -> r.date != null).map(r -> r.date).max(LocalDate::compareTo).orElse(null);
        Map<String, Integer> keys = new HashMap<>();
        if (min == null) {
            return keys;
        }
        for (Transaction t : transactions.findByUserIdAndOccurredOnBetweenOrderByOccurredOnAscIdAsc(userId, min, max)) {
            Account account = lookups.accountsById.get(t.getAccountId());
            String key = ParsedRow.key(t.getOccurredOn(), t.getType(), t.getAmount(),
                    account == null ? "" : account.getName(), t.getNote());
            keys.merge(key, 1, Integer::sum);
        }
        return keys;
    }

    private static String value(CSVRecord record, int index) {
        if (index < 0 || index >= record.size()) {
            return null;
        }
        String value = record.get(index);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String truncate(String value, int max) {
        return value == null || value.length() <= max ? value : value.substring(0, max);
    }

    private static String capitalize(String message) {
        return message == null || message.isEmpty() ? "Помилка в рядку"
                : Character.toUpperCase(message.charAt(0)) + message.substring(1);
    }

    /** Кеш рахунків і категорій користувача; створює відсутні під час збереження. */
    private final class Lookups {
        private final Long userId;
        private final Map<Long, Account> accountsById = new HashMap<>();
        private final Map<String, Account> accountsByName = new HashMap<>();
        private final List<Category> categories;
        private int createdAccounts;
        private int createdCategories;

        Lookups(Long userId) {
            this.userId = userId;
            for (Account account : accountRepository.findByUserIdOrderByArchivedAscCreatedAtAsc(userId)) {
                accountsById.put(account.getId(), account);
                accountsByName.putIfAbsent(normalize(account.getName()), account);
            }
            this.categories = new ArrayList<>(categoryService.mapForUser(userId).values());
        }

        Account findAccount(String name) {
            return accountsByName.get(normalize(name));
        }

        Account account(String name) {
            Account account = findAccount(name);
            if (account == null) {
                account = new Account();
                account.setUserId(userId);
                account.setName(name.length() > 100 ? name.substring(0, 100) : name);
                account.setType(AccountType.OTHER);
                account.setColor("#868e96");
                account.setInitialBalance(BigDecimal.ZERO);
                account.setCreatedAt(clock.instant());
                accountRepository.save(account);
                accountsById.put(account.getId(), account);
                accountsByName.put(normalize(name), account);
                createdAccounts++;
            }
            return account;
        }

        Category findCategory(CategoryType type, Long parentId, String name) {
            String normalized = normalize(name);
            return categories.stream()
                    .filter(c -> c.getType() == type && Objects.equals(c.getParentId(), parentId)
                            && normalize(c.getName()).equals(normalized))
                    .findFirst()
                    .orElse(null);
        }

        Category category(TransactionType transactionType, String parentName, String childName) {
            CategoryType type = CategoryType.valueOf(transactionType.name());
            String name = parentName != null ? parentName : DEFAULT_CATEGORY;
            Category parent = findCategory(type, null, name);
            if (parent == null) {
                parent = categoryService.createRaw(userId, type, truncate(name, 100), null);
                categories.add(parent);
                createdCategories++;
            }
            if (childName == null) {
                return parent;
            }
            Category child = findCategory(type, parent.getId(), childName);
            if (child == null) {
                child = categoryService.createRaw(userId, type, truncate(childName, 100), parent.getId());
                categories.add(child);
                createdCategories++;
            }
            return child;
        }

        private static String normalize(String value) {
            return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        }
    }

    private static final class ParsedRow {
        private final long line;
        private LocalDate date;
        private TransactionType type;
        private BigDecimal amount;
        private String account;
        private String toAccount;
        private String category;
        private String subcategory;
        private String note;
        private RowStatus status = RowStatus.OK;
        private String message;

        ParsedRow(long line) {
            this.line = line;
        }

        void fail(String reason) {
            status = RowStatus.ERROR;
            message = reason;
        }

        String key() {
            return key(date, type, amount, account, note);
        }

        static String key(LocalDate date, TransactionType type, BigDecimal amount, String account, String note) {
            return date + "|" + type + "|" + amount.setScale(2, RoundingMode.HALF_UP).toPlainString() + "|"
                    + (account == null ? "" : account.trim().toLowerCase(Locale.ROOT)) + "|"
                    + (note == null ? "" : note.trim().toLowerCase(Locale.ROOT));
        }

        ImportRowDto toDto() {
            return new ImportRowDto(line, date, type, amount, account, category, subcategory, toAccount, note, status, message);
        }
    }
}
