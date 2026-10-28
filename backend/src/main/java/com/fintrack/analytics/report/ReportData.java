package com.fintrack.analytics.report;

import com.fintrack.analytics.AnalyticsDtos.CategoryShareDto;
import com.fintrack.analytics.AnalyticsDtos.MonthlyPointDto;
import com.fintrack.analytics.AnalyticsDtos.SummaryDto;
import com.fintrack.operations.account.AccountDtos.AccountDto;
import com.fintrack.operations.transaction.TransactionType;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.List;

/** Дані зведеного звіту за період — спільні для PDF та Excel (REQ-3.3). */
public record ReportData(String userName, String email, String currency, LocalDate from, LocalDate to,
                         ZonedDateTime generatedAt, SummaryDto summary, List<CategoryShareDto> expenseByCategory,
                         List<CategoryShareDto> incomeByCategory, List<MonthlyPointDto> monthly,
                         List<AccountDto> accounts, List<Row> transactions) {

    public record Row(LocalDate date, TransactionType type, BigDecimal amount, String account, String toAccount,
                      String category, String note) {
    }

    public static String typeLabel(TransactionType type) {
        return switch (type) {
            case INCOME -> "Дохід";
            case EXPENSE -> "Витрата";
            case TRANSFER -> "Переказ";
        };
    }
}
