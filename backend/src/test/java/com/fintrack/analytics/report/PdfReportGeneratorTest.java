package com.fintrack.analytics.report;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PdfReportGeneratorTest {

    @Test
    void embeddedFontSupportsUkrainianAndCurrencySigns() {
        PdfReportGenerator generator = new PdfReportGenerator();
        assertThat(generator.fontSupports("Звіт: доходи, витрати, ґанок, їжа, єнот — 1 234,56 ₴ € $ −")).isTrue();
    }
}
