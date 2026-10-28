package com.fintrack.common;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.Locale;

/** Форматування сум і місяців українською для сповіщень та звітів. */
public final class MoneyFormat {

    public static final Locale UK = Locale.forLanguageTag("uk-UA");

    private static final String[] MONTHS = {
            "січень", "лютий", "березень", "квітень", "травень", "червень",
            "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"
    };

    private MoneyFormat() {
    }

    public static String format(BigDecimal amount, String currency) {
        return number(amount) + " " + symbol(currency);
    }

    public static String number(BigDecimal amount) {
        DecimalFormatSymbols symbols = new DecimalFormatSymbols(UK);
        symbols.setGroupingSeparator(' ');
        symbols.setDecimalSeparator(',');
        symbols.setMinusSign('−');
        return new DecimalFormat("#,##0.00", symbols).format(amount == null ? BigDecimal.ZERO : amount);
    }

    public static String symbol(String currency) {
        if (currency == null) {
            return "";
        }
        return switch (currency) {
            case "UAH" -> "₴";
            case "USD" -> "$";
            case "EUR" -> "€";
            case "GBP" -> "£";
            case "PLN" -> "zł";
            default -> currency;
        };
    }

    /** «жовтень 2026» */
    public static String month(YearMonth month) {
        return MONTHS[month.getMonthValue() - 1] + " " + month.getYear();
    }

    public static String shortMonth(YearMonth month) {
        return month.getMonth().getDisplayName(TextStyle.SHORT_STANDALONE, UK) + " " + month.getYear();
    }
}
