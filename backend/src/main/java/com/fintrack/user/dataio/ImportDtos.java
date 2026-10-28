package com.fintrack.user.dataio;

import com.fintrack.operations.transaction.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class ImportDtos {

    private ImportDtos() {
    }

    /**
     * @param dryRun           лише перевірити файл і показати попередній перегляд, нічого не зберігаючи
     * @param createMissing    створювати рахунки/категорії, яких ще немає
     * @param skipDuplicates   пропускати рядки, що вже є серед операцій (повторний імпорт того самого файлу)
     * @param defaultAccountId рахунок для файлів без колонки «Рахунок» (наприклад, банківська виписка)
     */
    public record ImportOptions(boolean dryRun, boolean createMissing, boolean skipDuplicates, Long defaultAccountId) {
    }

    public enum RowStatus { OK, DUPLICATE, ERROR }

    public record ImportRowDto(long line, LocalDate date, TransactionType type, BigDecimal amount, String account,
                               String category, String subcategory, String toAccount, String note,
                               RowStatus status, String message) {
    }

    public record ImportResult(boolean dryRun, String encoding, String delimiter, Map<String, String> columns,
                               int totalRows, int validRows, int duplicateRows, int errorRows, int imported,
                               List<String> newAccounts, List<String> newCategories, boolean needsDefaultAccount,
                               List<ImportRowDto> preview, List<ImportRowDto> errors) {
    }
}
