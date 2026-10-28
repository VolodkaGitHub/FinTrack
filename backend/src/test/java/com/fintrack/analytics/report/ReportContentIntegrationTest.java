package com.fintrack.analytics.report;

import com.fintrack.support.ApiTestSupport;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** REQ-3.3: вміст зведених звітів PDF та Excel за обраний період. */
class ReportContentIntegrationTest extends ApiTestSupport {

    private static final LocalDate DAY = LocalDate.of(2025, 2, 14);
    private static final String RANGE = "from=2025-02-01&to=2025-02-28";

    @BeforeEach
    void setUp() throws Exception {
        user = testUsers.create();
        long card = accountId("Банківська картка");
        createTx("INCOME", "25000", DAY, card, categoryId("Зарплата"), null, "Лютнева зарплата");
        createTx("EXPENSE", "1200", DAY, card, categoryId("Супермаркет"), null, "Сільпо");
        createTx("EXPENSE", "450.50", DAY, card, categoryId("Кафе та ресторани"), null, "Кава з колегами");
        createTx("TRANSFER", "1000", DAY, card, null, accountId("Готівка"), "Зняття готівки");
        createTx("EXPENSE", "999", LocalDate.of(2025, 3, 1), card, categoryId("Освіта"), null, "Поза періодом");
    }

    @Test
    void pdfReportContainsSummaryCategoriesAndOperations() throws Exception {
        MockHttpServletResponse response = raw(get("/api/reports/summary?format=pdf&" + RANGE), 200).getResponse();
        assertThat(response.getContentType()).isEqualTo("application/pdf");
        assertThat(response.getHeader("Content-Disposition")).contains("fintrack-report_2025-02-01_2025-02-28.pdf");

        PdfReader reader = new PdfReader(response.getContentAsByteArray());
        assertThat(reader.getInfo().get("Title")).isEqualTo("FinTrack — фінансовий звіт");
        StringBuilder text = new StringBuilder();
        PdfTextExtractor extractor = new PdfTextExtractor(reader);
        for (int page = 1; page <= reader.getNumberOfPages(); page++) {
            text.append(extractor.getTextFromPage(page)).append('\n');
        }
        assertThat(text.toString())
                .contains("Фінансовий звіт", "01.02.2025", "28.02.2025")
                .contains("Витрати за категоріями", "Продукти", "Кафе та ресторани")
                .contains("Доходи та витрати по місяцях")
                .contains("Найбільші витрати", "Сільпо", "Кава з колегами", "Зняття готівки")
                .doesNotContain("Поза періодом");
        reader.close();
    }

    @Test
    void excelReportHasAllSheetsAndWorkingFormulas() throws Exception {
        MockHttpServletResponse response = raw(get("/api/reports/summary?format=xlsx&" + RANGE), 200).getResponse();
        assertThat(response.getContentType()).isEqualTo("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            List<String> sheets = new ArrayList<>();
            workbook.forEach(sheet -> sheets.add(sheet.getSheetName()));
            assertThat(sheets).containsExactly("Підсумок", "Категорії", "По місяцях", "Рахунки", "Операції");
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();

            Sheet summary = workbook.getSheet("Підсумок");
            assertThat(summary.getRow(7).getCell(1).getNumericCellValue()).isEqualTo(25000.0);
            assertThat(summary.getRow(8).getCell(1).getNumericCellValue()).isEqualTo(1650.5);
            Cell net = summary.getRow(9).getCell(1);
            assertThat(net.getCellType()).isEqualTo(CellType.FORMULA);
            assertThat(evaluator.evaluate(net).getNumberValue()).isCloseTo(23349.5, within(0.001));

            Sheet operations = workbook.getSheet("Операції");
            assertThat(operations.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Дата");
            assertThat(operations.getRow(4).getCell(1).getStringCellValue()).isEqualTo("Переказ");
            assertThat(operations.getRow(5)).isNull();
            assertThat(evaluator.evaluate(findValueCell(operations, "Разом витрат")).getNumberValue()).isCloseTo(1650.5, within(0.001));
            assertThat(evaluator.evaluate(findValueCell(operations, "Разом доходів")).getNumberValue()).isCloseTo(25000, within(0.001));

            Sheet categories = workbook.getSheet("Категорії");
            assertThat(categories.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Витрати за категоріями");
            assertThat(evaluator.evaluate(findValueCell(categories, "Разом")).getNumberValue()).isCloseTo(1650.5, within(0.001));

            Sheet monthly = workbook.getSheet("По місяцях");
            assertThat(evaluator.evaluate(monthly.getRow(1).getCell(3)).getNumberValue()).isCloseTo(23349.5, within(0.001));
        }
    }

    @Test
    void reportRequiresValidPeriodAndFormat() throws Exception {
        raw(get("/api/reports/summary?format=pdf&from=2025-03-01&to=2025-02-01"), 400);
        raw(get("/api/reports/summary?format=pdf&from=2015-01-01&to=2025-02-01"), 400);
        raw(get("/api/reports/summary?format=csv&" + RANGE), 400);
        raw(get("/api/reports/summary?format=pdf"), 400);
    }

    /** Комірка зі значенням праворуч від підпису (у будь-якому стовпці аркуша). */
    private static Cell findValueCell(Sheet sheet, String label) {
        for (Row row : sheet) {
            for (Cell cell : row) {
                if (cell.getCellType() == CellType.STRING && label.equals(cell.getStringCellValue())) {
                    return row.getCell(cell.getColumnIndex() + 1);
                }
            }
        }
        throw new AssertionError("Label not found: " + label);
    }
}
