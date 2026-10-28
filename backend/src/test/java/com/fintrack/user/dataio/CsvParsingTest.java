package com.fintrack.user.dataio;

import com.fintrack.operations.transaction.TransactionType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.nio.charset.Charset;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CsvParsingTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "1234.56|1234.56",
            "1 234,56|1234.56",
            "-1,234.56|-1234.56",
            "1.234,56|1234.56",
            "12,5|12.5",
            "1,234,567|1234567",
            "−350,00 ₴|-350.00",
            "+500|500"
    })
    void parsesAmountsInDifferentFormats(String raw, String expected) {
        assertThat(CsvParsing.parseAmount(raw)).isEqualByComparingTo(expected);
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "2026-10-05|2026-10-05",
            "05.10.2026|2026-10-05",
            "05.10.2026 14:31:00|2026-10-05",
            "2026-10-05T10:15:30|2026-10-05",
            "5/10/2026|2026-10-05",
            "05.10.26|2026-10-05"
    })
    void parsesDates(String raw, LocalDate expected) {
        assertThat(CsvParsing.parseDate(raw)).isEqualTo(expected);
    }

    @Test
    void rejectsUnknownDate() {
        assertThatThrownBy(() -> CsvParsing.parseDate("вчора")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void parsesTypes() {
        assertThat(CsvParsing.parseType("EXPENSE")).isEqualTo(TransactionType.EXPENSE);
        assertThat(CsvParsing.parseType("Дохід")).isEqualTo(TransactionType.INCOME);
        assertThat(CsvParsing.parseType("переказ")).isEqualTo(TransactionType.TRANSFER);
        assertThat(CsvParsing.parseType("")).isNull();
    }

    @Test
    void detectsOwnExportColumns() {
        CsvParsing.Columns columns = CsvParsing.Columns.detect(List.of(CsvExportService.HEADERS));
        assertThat(columns).isEqualTo(new CsvParsing.Columns(0, 2, 1, 3, 6, 4, 5, 7));
    }

    @Test
    void detectsBankStatementColumns() {
        List<String> monobank = List.of("Дата i час операції", "Деталі операції", "MCC", "Сума в валюті картки (UAH)",
                "Сума в валюті операції", "Валюта", "Курс", "Сума комісій (UAH)", "Сума кешбеку (UAH)", "Залишок після операції");
        CsvParsing.Columns columns = CsvParsing.Columns.detect(monobank);
        assertThat(columns.date()).isZero();
        assertThat(columns.note()).isEqualTo(1);
        assertThat(columns.amount()).isEqualTo(3);
        assertThat(columns.account()).isNegative();
        assertThat(columns.category()).isNegative();
    }

    @Test
    void decodesWindows1251AndDetectsDelimiter() {
        byte[] bytes = "Дата;Сума;Опис\n01.10.2026;-100;Кава".getBytes(Charset.forName("windows-1251"));
        CsvParsing.Decoded decoded = CsvParsing.decode(bytes);
        assertThat(decoded.encoding()).isEqualTo("Windows-1251");
        assertThat(decoded.text()).startsWith("Дата;Сума");
        assertThat(CsvParsing.detectDelimiter(decoded.text())).isEqualTo(';');
    }
}
