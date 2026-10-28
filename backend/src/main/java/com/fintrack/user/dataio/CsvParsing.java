package com.fintrack.user.dataio;

import com.fintrack.operations.transaction.TransactionType;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Розбір CSV з інших застосунків і банківських виписок: кодування (UTF-8 / Windows-1251), роздільник,
 * заголовки українською чи англійською, різні формати дат і сум («1 234,56», «-1,234.56»).
 */
final class CsvParsing {

    private CsvParsing() {
    }

    record Decoded(String text, String encoding) {
    }

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            "uuuu-MM-dd", "dd.MM.uuuu", "d.M.uuuu", "dd/MM/uuuu", "MM/dd/uuuu", "d/M/uuuu", "dd-MM-uuuu",
            "uuuu/MM/dd", "uuuu.MM.dd", "dd.MM.uu")
            .stream()
            .map(pattern -> DateTimeFormatter.ofPattern(pattern).withResolverStyle(ResolverStyle.STRICT))
            .toList();

    static Decoded decode(byte[] bytes) {
        if (bytes.length >= 3 && bytes[0] == (byte) 0xEF && bytes[1] == (byte) 0xBB && bytes[2] == (byte) 0xBF) {
            return new Decoded(new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8), "UTF-8");
        }
        try {
            String text = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes))
                    .toString();
            return new Decoded(text, "UTF-8");
        } catch (CharacterCodingException e) {
            return new Decoded(new String(bytes, Charset.forName("windows-1251")), "Windows-1251");
        }
    }

    static char detectDelimiter(String text) {
        int end = text.indexOf('\n');
        String header = end < 0 ? text : text.substring(0, end);
        char best = ',';
        long bestCount = 0;
        for (char candidate : new char[]{',', ';', '\t', '|'}) {
            long count = header.chars().filter(c -> c == candidate).count();
            if (count > bestCount) {
                best = candidate;
                bestCount = count;
            }
        }
        return best;
    }

    static String delimiterName(char delimiter) {
        return switch (delimiter) {
            case ';' -> "крапка з комою";
            case '\t' -> "табуляція";
            case '|' -> "вертикальна риска";
            default -> "кома";
        };
    }

    static LocalDate parseDate(String raw) {
        String value = raw.trim();
        int cut = value.indexOf('T');
        if (cut < 0) {
            cut = value.indexOf(' ');
        }
        if (cut > 0) {
            value = value.substring(0, cut);
        }
        for (DateTimeFormatter format : DATE_FORMATS) {
            try {
                return LocalDate.parse(value, format);
            } catch (DateTimeParseException ignored) {
                // try next format
            }
        }
        throw new IllegalArgumentException("невідомий формат дати «" + raw + "»");
    }

    static BigDecimal parseAmount(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("порожня сума");
        }
        String value = raw.replace(" ", "").replace(" ", "").replace(" ", "").replace("−", "-");
        value = value.replaceAll("[^0-9,.+\\-]", "");
        int lastComma = value.lastIndexOf(',');
        int lastDot = value.lastIndexOf('.');
        if (lastComma >= 0 && lastDot >= 0) {
            value = lastComma > lastDot
                    ? value.replace(".", "").replace(',', '.')
                    : value.replace(",", "");
        } else if (lastComma >= 0) {
            int decimals = value.length() - lastComma - 1;
            value = value.indexOf(',') == lastComma && decimals <= 2
                    ? value.replace(',', '.')
                    : value.replace(",", "");
        } else if (lastDot >= 0 && value.indexOf('.') != lastDot) {
            value = value.replace(".", "");
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("некоректна сума «" + raw + "»");
        }
    }

    /** null — тип не вказано (визначається за знаком суми). */
    static TransactionType parseType(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if (value.startsWith("transfer") || value.startsWith("переказ") || value.startsWith("переміщ")) {
            return TransactionType.TRANSFER;
        }
        if (value.startsWith("income") || value.startsWith("дохід") || value.startsWith("доход")
                || value.startsWith("надходж") || value.startsWith("зарахув") || value.equals("+")) {
            return TransactionType.INCOME;
        }
        if (value.startsWith("expense") || value.startsWith("витрат") || value.startsWith("списан")
                || value.startsWith("покупк") || value.equals("-")) {
            return TransactionType.EXPENSE;
        }
        throw new IllegalArgumentException("невідомий тип операції «" + raw + "»");
    }

    /** Індекси колонок, визначені за заголовками (−1 — колонки немає). */
    record Columns(int date, int amount, int type, int account, int toAccount, int category, int subcategory, int note) {

        static Columns detect(List<String> headers) {
            int date = -1, amount = -1, type = -1, account = -1, toAccount = -1, category = -1, subcategory = -1, note = -1;
            for (int i = 0; i < headers.size(); i++) {
                String h = headers.get(i) == null ? "" : headers.get(i).replace("﻿", "").trim().toLowerCase(Locale.ROOT);
                if (h.isEmpty()) {
                    continue;
                }
                if (date < 0 && (h.contains("date") || h.contains("дата"))) {
                    date = i;
                } else if (amount < 0 && (h.contains("amount") || h.contains("сума") || h.equals("sum"))) {
                    amount = i;
                } else if (type < 0 && (h.equals("type") || h.equals("тип") || h.startsWith("тип операц"))) {
                    type = i;
                } else if (subcategory < 0 && (h.contains("subcategory") || h.contains("підкатегор"))) {
                    subcategory = i;
                } else if (category < 0 && (h.contains("category") || h.contains("категор"))) {
                    category = i;
                } else if (toAccount < 0 && (h.equals("to_account") || h.equals("to account")
                        || h.contains("рахунок зарахування") || h.contains("на рахунок"))) {
                    toAccount = i;
                } else if (account < 0 && (h.contains("account") || h.contains("рахун") || h.contains("гаман") || h.contains("wallet"))) {
                    account = i;
                } else if (note < 0 && (h.contains("note") || h.contains("descr") || h.contains("опис") || h.contains("примітк")
                        || h.contains("нотатк") || h.contains("коментар") || h.contains("деталі") || h.contains("memo")
                        || h.contains("payee") || h.contains("призначення"))) {
                    note = i;
                }
            }
            return new Columns(date, amount, type, account, toAccount, category, subcategory, note);
        }

        Map<String, String> describe(List<String> headers) {
            Map<String, String> result = new LinkedHashMap<>();
            put(result, "date", date, headers);
            put(result, "amount", amount, headers);
            put(result, "type", type, headers);
            put(result, "account", account, headers);
            put(result, "toAccount", toAccount, headers);
            put(result, "category", category, headers);
            put(result, "subcategory", subcategory, headers);
            put(result, "note", note, headers);
            return result;
        }

        private static void put(Map<String, String> map, String key, int index, List<String> headers) {
            if (index >= 0) {
                map.put(key, headers.get(index).replace("﻿", "").trim());
            }
        }
    }
}
