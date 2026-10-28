package com.fintrack.analytics.report;

import com.fintrack.analytics.AnalyticsDtos.CategoryShareDto;
import com.fintrack.analytics.AnalyticsDtos.MonthlyPointDto;
import com.fintrack.common.MoneyFormat;
import com.fintrack.operations.account.AccountDtos.AccountDto;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormat;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** REQ-3.3: зведений звіт у форматі Excel (Apache POI): підсумки, категорії, динаміка, рахунки, усі операції. */
@Component
public class ExcelReportGenerator {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");

    public byte[] generate(ReportData data) {
        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Styles styles = new Styles(workbook);
            summarySheet(workbook, styles, data);
            categoriesSheet(workbook, styles, data);
            monthlySheet(workbook, styles, data.monthly());
            accountsSheet(workbook, styles, data.accounts());
            transactionsSheet(workbook, styles, data);
            workbook.setForceFormulaRecalculation(true);
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Не вдалося сформувати Excel-звіт", e);
        }
    }

    private void summarySheet(XSSFWorkbook workbook, Styles styles, ReportData data) {
        Sheet sheet = workbook.createSheet("Підсумок");
        sheet.setColumnWidth(0, 28 * 256);
        sheet.setColumnWidth(1, 22 * 256);
        text(sheet.createRow(0), 0, "FinTrack — фінансовий звіт", styles.title);
        text(sheet.createRow(1), 0, "Період: " + DATE.format(data.from()) + " — " + DATE.format(data.to()), null);
        text(sheet.createRow(2), 0, "Користувач: " + data.userName() + " (" + data.email() + ")", null);
        text(sheet.createRow(3), 0, "Сформовано: " + DATE_TIME.format(data.generatedAt()), null);
        text(sheet.createRow(4), 0, "Валюта: " + data.currency() + " (" + MoneyFormat.symbol(data.currency()) + ")", null);

        Row header = sheet.createRow(6);
        text(header, 0, "Показник", styles.header);
        text(header, 1, "Сума", styles.header);
        moneyRow(sheet, 7, "Доходи", data.summary().income(), styles);
        moneyRow(sheet, 8, "Витрати", data.summary().expense(), styles);
        Row net = sheet.createRow(9);
        text(net, 0, "Сальдо (доходи − витрати)", styles.bold);
        Cell formula = net.createCell(1);
        formula.setCellFormula("B8-B9");
        formula.setCellStyle(styles.moneyBold);
        moneyRow(sheet, 10, "Баланс усіх рахунків", data.summary().totalBalance(), styles);
        Row count = sheet.createRow(11);
        text(count, 0, "Кількість операцій", null);
        count.createCell(1).setCellValue(data.summary().transactionCount());
    }

    private void categoriesSheet(XSSFWorkbook workbook, Styles styles, ReportData data) {
        Sheet sheet = workbook.createSheet("Категорії");
        sheet.setColumnWidth(0, 32 * 256);
        sheet.setColumnWidth(1, 18 * 256);
        sheet.setColumnWidth(2, 12 * 256);
        int rowIndex = shareBlock(sheet, styles, 0, "Витрати за категоріями", data.expenseByCategory());
        shareBlock(sheet, styles, rowIndex + 2, "Доходи за категоріями", data.incomeByCategory());
    }

    private int shareBlock(Sheet sheet, Styles styles, int start, String title, List<CategoryShareDto> shares) {
        text(sheet.createRow(start), 0, title, styles.bold);
        Row header = sheet.createRow(start + 1);
        text(header, 0, "Категорія", styles.header);
        text(header, 1, "Сума", styles.header);
        text(header, 2, "Частка", styles.header);
        int rowIndex = start + 2;
        for (CategoryShareDto share : shares) {
            Row row = sheet.createRow(rowIndex++);
            text(row, 0, share.name(), null);
            money(row, 1, share.amount(), styles.money);
            Cell percent = row.createCell(2);
            percent.setCellValue(share.percent() / 100.0);
            percent.setCellStyle(styles.percent);
        }
        Row total = sheet.createRow(rowIndex);
        text(total, 0, "Разом", styles.bold);
        Cell sum = total.createCell(1);
        sum.setCellFormula(shares.isEmpty() ? "0" : "SUM(B" + (start + 3) + ":B" + rowIndex + ")");
        sum.setCellStyle(styles.moneyBold);
        return rowIndex;
    }

    private void monthlySheet(XSSFWorkbook workbook, Styles styles, List<MonthlyPointDto> points) {
        Sheet sheet = workbook.createSheet("По місяцях");
        String[] titles = {"Місяць", "Доходи", "Витрати", "Сальдо", "Тренд доходів", "Тренд витрат"};
        Row header = sheet.createRow(0);
        for (int i = 0; i < titles.length; i++) {
            text(header, i, titles[i], styles.header);
            sheet.setColumnWidth(i, (i == 0 ? 14 : 17) * 256);
        }
        int rowIndex = 1;
        for (MonthlyPointDto point : points) {
            Row row = sheet.createRow(rowIndex);
            text(row, 0, MoneyFormat.shortMonth(YearMonth.parse(point.month())), null);
            money(row, 1, point.income(), styles.money);
            money(row, 2, point.expense(), styles.money);
            Cell net = row.createCell(3);
            net.setCellFormula("B" + (rowIndex + 1) + "-C" + (rowIndex + 1));
            net.setCellStyle(styles.money);
            money(row, 4, point.incomeTrend(), styles.money);
            money(row, 5, point.expenseTrend(), styles.money);
            rowIndex++;
        }
        sheet.createFreezePane(0, 1);
    }

    private void accountsSheet(XSSFWorkbook workbook, Styles styles, List<AccountDto> accounts) {
        Sheet sheet = workbook.createSheet("Рахунки");
        String[] titles = {"Рахунок", "Тип", "Початковий баланс", "Поточний баланс", "Статус"};
        Row header = sheet.createRow(0);
        for (int i = 0; i < titles.length; i++) {
            text(header, i, titles[i], styles.header);
            sheet.setColumnWidth(i, 20 * 256);
        }
        int rowIndex = 1;
        for (AccountDto account : accounts) {
            Row row = sheet.createRow(rowIndex++);
            text(row, 0, account.name(), null);
            text(row, 1, account.type().name(), null);
            money(row, 2, account.initialBalance(), styles.money);
            money(row, 3, account.balance(), styles.money);
            text(row, 4, account.archived() ? "Архів" : "Активний", null);
        }
    }

    private void transactionsSheet(XSSFWorkbook workbook, Styles styles, ReportData data) {
        Sheet sheet = workbook.createSheet("Операції");
        String[] titles = {"Дата", "Тип", "Сума", "Рахунок", "Категорія", "Рахунок зарахування", "Нотатка"};
        int[] widths = {12, 11, 15, 22, 30, 22, 40};
        Row header = sheet.createRow(0);
        for (int i = 0; i < titles.length; i++) {
            text(header, i, titles[i], styles.header);
            sheet.setColumnWidth(i, widths[i] * 256);
        }
        int rowIndex = 1;
        for (ReportData.Row item : data.transactions()) {
            Row row = sheet.createRow(rowIndex++);
            Cell date = row.createCell(0);
            date.setCellValue(item.date());
            date.setCellStyle(styles.date);
            text(row, 1, ReportData.typeLabel(item.type()), null);
            money(row, 2, item.amount(), styles.money);
            text(row, 3, item.account(), null);
            text(row, 4, item.category(), null);
            text(row, 5, item.toAccount(), null);
            text(row, 6, item.note(), null);
        }
        sheet.setAutoFilter(new CellRangeAddress(0, Math.max(rowIndex - 1, 1), 0, titles.length - 1));
        sheet.createFreezePane(0, 1);
        int totalsRow = rowIndex + 1;
        int lastExcelRow = Math.max(rowIndex, 2);
        String range = "$B$2:$B$" + lastExcelRow;
        String amounts = "$C$2:$C$" + lastExcelRow;
        sumIf(sheet.createRow(totalsRow), "Разом доходів", range, "Дохід", amounts, styles);
        sumIf(sheet.createRow(totalsRow + 1), "Разом витрат", range, "Витрата", amounts, styles);
    }

    private static void sumIf(Row row, String label, String range, String criteria, String amounts, Styles styles) {
        text(row, 1, label, styles.bold);
        Cell cell = row.createCell(2);
        cell.setCellFormula("SUMIF(" + range + ",\"" + criteria + "\"," + amounts + ")");
        cell.setCellStyle(styles.moneyBold);
    }

    private static void moneyRow(Sheet sheet, int index, String label, BigDecimal value, Styles styles) {
        Row row = sheet.createRow(index);
        text(row, 0, label, null);
        money(row, 1, value, styles.money);
    }

    private static void text(Row row, int column, String value, CellStyle style) {
        Cell cell = row.createCell(column);
        cell.setCellValue(value == null ? "" : value);
        if (style != null) {
            cell.setCellStyle(style);
        }
    }

    private static void money(Row row, int column, BigDecimal value, CellStyle style) {
        Cell cell = row.createCell(column);
        if (value != null) {
            cell.setCellValue(value.doubleValue());
        }
        cell.setCellStyle(style);
    }

    private static final class Styles {
        final CellStyle header;
        final CellStyle title;
        final CellStyle bold;
        final CellStyle money;
        final CellStyle moneyBold;
        final CellStyle percent;
        final CellStyle date;

        Styles(XSSFWorkbook workbook) {
            DataFormat format = workbook.createDataFormat();
            Font headerFont = workbook.createFont();
            headerFont.setBold(true);
            headerFont.setColor(IndexedColors.WHITE.getIndex());
            header = workbook.createCellStyle();
            header.setFont(headerFont);
            header.setFillForegroundColor(IndexedColors.DARK_TEAL.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            header.setBorderBottom(BorderStyle.THIN);

            Font titleFont = workbook.createFont();
            titleFont.setBold(true);
            titleFont.setFontHeightInPoints((short) 15);
            title = workbook.createCellStyle();
            title.setFont(titleFont);

            Font boldFont = workbook.createFont();
            boldFont.setBold(true);
            bold = workbook.createCellStyle();
            bold.setFont(boldFont);

            money = workbook.createCellStyle();
            money.setDataFormat(format.getFormat("#,##0.00"));

            moneyBold = workbook.createCellStyle();
            moneyBold.setDataFormat(format.getFormat("#,##0.00"));
            moneyBold.setFont(boldFont);

            percent = workbook.createCellStyle();
            percent.setDataFormat(format.getFormat("0.0%"));

            date = workbook.createCellStyle();
            date.setDataFormat(format.getFormat("dd.mm.yyyy"));
        }
    }
}
