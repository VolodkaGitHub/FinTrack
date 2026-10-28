package com.fintrack.user.dataio;

import com.fintrack.budgeting.category.Category;
import com.fintrack.budgeting.category.CategoryService;
import com.fintrack.operations.account.Account;
import com.fintrack.operations.account.AccountRepository;
import com.fintrack.operations.transaction.Transaction;
import com.fintrack.operations.transaction.TransactionRepository;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** REQ-4.3: експорт історії операцій у CSV (UTF-8 з BOM — коректно відкривається в Excel). */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CsvExportService {

    static final String[] HEADERS = {"date", "type", "amount", "account", "category", "subcategory", "to_account", "note"};

    private final TransactionRepository transactions;
    private final AccountRepository accounts;
    private final CategoryService categories;

    public byte[] export(Long userId, LocalDate from, LocalDate to, char delimiter) {
        List<Transaction> list = from == null && to == null
                ? transactions.findByUserIdOrderByOccurredOnAscIdAsc(userId)
                : transactions.findByUserIdAndOccurredOnBetweenOrderByOccurredOnAscIdAsc(userId,
                from != null ? from : LocalDate.of(1900, 1, 1), to != null ? to : LocalDate.of(9999, 12, 31));
        Map<Long, String> accountNames = accounts.findByUserIdOrderByArchivedAscCreatedAtAsc(userId).stream()
                .collect(Collectors.toMap(Account::getId, Account::getName));
        Map<Long, Category> cats = categories.mapForUser(userId);
        CSVFormat format = CSVFormat.DEFAULT.builder()
                .setDelimiter(delimiter)
                .setHeader(HEADERS)
                .setRecordSeparator("\r\n")
                .build();
        StringBuilder out = new StringBuilder("﻿");
        try (CSVPrinter printer = new CSVPrinter(out, format)) {
            for (Transaction t : list) {
                Category category = t.getCategoryId() == null ? null : cats.get(t.getCategoryId());
                Category parent = category != null && category.getParentId() != null ? cats.get(category.getParentId()) : null;
                printer.printRecord(
                        t.getOccurredOn().toString(),
                        t.getType().name(),
                        t.getAmount().toPlainString(),
                        accountNames.getOrDefault(t.getAccountId(), ""),
                        parent != null ? parent.getName() : category != null ? category.getName() : "",
                        parent != null ? category.getName() : "",
                        t.getToAccountId() == null ? "" : accountNames.getOrDefault(t.getToAccountId(), ""),
                        t.getNote() == null ? "" : t.getNote());
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.toString().getBytes(StandardCharsets.UTF_8);
    }
}
