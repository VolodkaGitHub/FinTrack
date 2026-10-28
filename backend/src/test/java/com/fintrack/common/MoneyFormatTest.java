package com.fintrack.common;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;

class MoneyFormatTest {

    @Test
    void formatsAmountsWithUkrainianSeparatorsAndCurrencySymbols() {
        assertThat(MoneyFormat.format(new BigDecimal("1234567.5"), "UAH")).isEqualTo("1 234 567,50 ₴");
        assertThat(MoneyFormat.format(new BigDecimal("-42"), "USD")).isEqualTo("−42,00 $");
        assertThat(MoneyFormat.format(null, "EUR")).isEqualTo("0,00 €");
        assertThat(MoneyFormat.symbol("GBP")).isEqualTo("£");
        assertThat(MoneyFormat.symbol("PLN")).isEqualTo("zł");
        assertThat(MoneyFormat.symbol("CHF")).isEqualTo("CHF");
        assertThat(MoneyFormat.symbol(null)).isEmpty();
    }

    @Test
    void formatsMonthsInUkrainian() {
        assertThat(MoneyFormat.month(YearMonth.of(2026, 10))).isEqualTo("жовтень 2026");
        assertThat(MoneyFormat.month(YearMonth.of(2025, 1))).isEqualTo("січень 2025");
        assertThat(MoneyFormat.shortMonth(YearMonth.of(2026, 3))).endsWith("2026");
    }
}
