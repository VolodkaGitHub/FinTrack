package com.fintrack.analytics.report;

import com.fintrack.analytics.AnalyticsDtos.CategoryShareDto;
import com.fintrack.analytics.AnalyticsDtos.MonthlyPointDto;
import com.fintrack.common.MoneyFormat;
import com.fintrack.operations.account.AccountDtos.AccountDto;
import com.fintrack.operations.transaction.TransactionType;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPCellEvent;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;

/** REQ-3.3: зведений звіт у PDF (OpenPDF, вбудований шрифт DejaVu Sans з підтримкою кирилиці). */
@Component
public class PdfReportGenerator {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    private static final int MAX_ROWS = 2000;

    private static final Color BRAND = new Color(0x0b, 0x72, 0x85);
    private static final Color DARK = new Color(0x21, 0x25, 0x29);
    private static final Color MUTED = new Color(0x86, 0x8e, 0x96);
    private static final Color GREEN = new Color(0x2b, 0x8a, 0x3e);
    private static final Color RED = new Color(0xc9, 0x2a, 0x2a);
    private static final Color STRIPE = new Color(0xf1, 0xf3, 0xf5);
    private static final Color BORDER = new Color(0xde, 0xe2, 0xe6);

    private final BaseFont regular;
    private final BaseFont bold;

    public PdfReportGenerator() {
        this.regular = loadFont("fonts/DejaVuSans.ttf");
        this.bold = loadFont("fonts/DejaVuSans-Bold.ttf");
    }

    public byte[] generate(ReportData data) {
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Document document = new Document(PageSize.A4, 36, 36, 40, 54);
            PdfWriter writer = PdfWriter.getInstance(document, out);
            writer.setPageEvent(new Footer());
            document.addTitle("FinTrack — фінансовий звіт");
            document.addAuthor(data.userName());
            document.addCreator("FinTrack");
            document.open();

            String currency = data.currency();
            document.add(new Paragraph("FinTrack · Фінансовий звіт", font(bold, 20, BRAND)));
            document.add(new Paragraph("Період: " + DATE.format(data.from()) + " — " + DATE.format(data.to())
                    + "     Користувач: " + data.userName() + " (" + data.email() + ")"
                    + "     Сформовано: " + DATE_TIME.format(data.generatedAt()), font(regular, 9, MUTED)));

            PdfPTable kpi = new PdfPTable(4);
            kpi.setWidthPercentage(100);
            kpi.setSpacingBefore(14);
            kpi.addCell(kpiCell("Доходи", MoneyFormat.format(data.summary().income(), currency), GREEN));
            kpi.addCell(kpiCell("Витрати", MoneyFormat.format(data.summary().expense(), currency), RED));
            kpi.addCell(kpiCell("Сальдо", MoneyFormat.format(data.summary().net(), currency),
                    data.summary().net().signum() < 0 ? RED : GREEN));
            kpi.addCell(kpiCell("Баланс рахунків", MoneyFormat.format(data.summary().totalBalance(), currency), BRAND));
            document.add(kpi);

            section(document, writer, "Витрати за категоріями");
            document.add(sharesTable(data.expenseByCategory(), currency, "Немає витрат за обраний період"));
            section(document, writer, "Доходи за категоріями");
            document.add(sharesTable(data.incomeByCategory(), currency, "Немає доходів за обраний період"));

            section(document, writer, "Доходи та витрати по місяцях");
            document.add(monthlyTable(data.monthly(), currency));

            section(document, writer, "Баланси рахунків");
            document.add(accountsTable(data.accounts(), currency));

            section(document, writer, "Найбільші витрати");
            document.add(topExpensesTable(data, currency));

            section(document, writer, "Операції за період (" + data.transactions().size() + ")");
            document.add(transactionsTable(data, currency));

            document.close();
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException("Не вдалося сформувати PDF-звіт", e);
        }
    }

    private PdfPTable sharesTable(List<CategoryShareDto> shares, String currency, String emptyText) {
        PdfPTable table = table(new float[]{4, 2.2f, 1.2f, 4});
        header(table, "Категорія", "Сума", "Частка", "");
        if (shares.isEmpty()) {
            PdfPCell cell = cell(emptyText, font(regular, 9, MUTED), Element.ALIGN_LEFT, null);
            cell.setColspan(4);
            table.addCell(cell);
            return table;
        }
        double max = shares.stream().mapToDouble(CategoryShareDto::percent).max().orElse(100);
        for (CategoryShareDto share : shares) {
            Font text = font(regular, 9, DARK);
            table.addCell(cell(share.name(), text, Element.ALIGN_LEFT, null));
            table.addCell(cell(MoneyFormat.format(share.amount(), currency), text, Element.ALIGN_RIGHT, null));
            table.addCell(cell(String.format("%.1f%%", share.percent()), text, Element.ALIGN_RIGHT, null));
            PdfPCell bar = cell(" ", text, Element.ALIGN_LEFT, null);
            bar.setCellEvent(new BarEvent(max > 0 ? share.percent() / max : 0, parseColor(share.color())));
            table.addCell(bar);
        }
        return table;
    }

    private PdfPTable monthlyTable(List<MonthlyPointDto> points, String currency) {
        PdfPTable table = table(new float[]{2.2f, 2.5f, 2.5f, 2.5f, 2.5f});
        header(table, "Місяць", "Доходи", "Витрати", "Сальдо", "Тренд витрат");
        boolean stripe = false;
        for (MonthlyPointDto point : points) {
            Color background = stripe ? STRIPE : null;
            Font text = font(regular, 9, DARK);
            table.addCell(cell(MoneyFormat.shortMonth(YearMonth.parse(point.month())), text, Element.ALIGN_LEFT, background));
            table.addCell(cell(MoneyFormat.format(point.income(), currency), font(regular, 9, GREEN), Element.ALIGN_RIGHT, background));
            table.addCell(cell(MoneyFormat.format(point.expense(), currency), font(regular, 9, RED), Element.ALIGN_RIGHT, background));
            table.addCell(cell(MoneyFormat.format(point.net(), currency), text, Element.ALIGN_RIGHT, background));
            table.addCell(cell(point.expenseTrend() == null ? "—" : MoneyFormat.format(point.expenseTrend(), currency),
                    font(regular, 9, MUTED), Element.ALIGN_RIGHT, background));
            stripe = !stripe;
        }
        return table;
    }

    private PdfPTable accountsTable(List<AccountDto> accounts, String currency) {
        PdfPTable table = table(new float[]{5, 2.5f, 3});
        header(table, "Рахунок", "Тип", "Баланс");
        for (AccountDto account : accounts) {
            Font text = font(regular, 9, account.archived() ? MUTED : DARK);
            table.addCell(cell(account.name() + (account.archived() ? " (архів)" : ""), text, Element.ALIGN_LEFT, null));
            table.addCell(cell(switch (account.type()) {
                case CASH -> "Готівка";
                case CARD -> "Картка";
                case SAVINGS -> "Накопичення";
                case OTHER -> "Інше";
            }, text, Element.ALIGN_LEFT, null));
            table.addCell(cell(MoneyFormat.format(account.balance(), currency), text, Element.ALIGN_RIGHT, null));
        }
        return table;
    }

    private PdfPTable topExpensesTable(ReportData data, String currency) {
        PdfPTable table = table(new float[]{1.8f, 3.5f, 4.5f, 2.4f});
        header(table, "Дата", "Категорія", "Нотатка", "Сума");
        List<ReportData.Row> top = data.transactions().stream()
                .filter(row -> row.type() == TransactionType.EXPENSE)
                .sorted(Comparator.comparing(ReportData.Row::amount).reversed())
                .limit(10)
                .toList();
        if (top.isEmpty()) {
            PdfPCell cell = cell("Немає витрат за обраний період", font(regular, 9, MUTED), Element.ALIGN_LEFT, null);
            cell.setColspan(4);
            table.addCell(cell);
        }
        for (ReportData.Row row : top) {
            Font text = font(regular, 9, DARK);
            table.addCell(cell(DATE.format(row.date()), text, Element.ALIGN_LEFT, null));
            table.addCell(cell(row.category(), text, Element.ALIGN_LEFT, null));
            table.addCell(cell(row.note() == null ? "" : row.note(), text, Element.ALIGN_LEFT, null));
            table.addCell(cell(MoneyFormat.format(row.amount(), currency), font(regular, 9, RED), Element.ALIGN_RIGHT, null));
        }
        return table;
    }

    private PdfPTable transactionsTable(ReportData data, String currency) {
        PdfPTable table = table(new float[]{1.7f, 1.5f, 3.2f, 2.4f, 3.5f, 2.3f});
        header(table, "Дата", "Тип", "Категорія", "Рахунок", "Нотатка", "Сума");
        boolean stripe = false;
        int count = 0;
        for (ReportData.Row row : data.transactions()) {
            if (++count > MAX_ROWS) {
                PdfPCell cell = cell("… показано перші " + MAX_ROWS + " операцій — повний перелік у звіті Excel",
                        font(regular, 8, MUTED), Element.ALIGN_LEFT, null);
                cell.setColspan(6);
                table.addCell(cell);
                break;
            }
            Color background = stripe ? STRIPE : null;
            Font text = font(regular, 8, DARK);
            Color amountColor = row.type() == TransactionType.INCOME ? GREEN : row.type() == TransactionType.EXPENSE ? RED : DARK;
            String sign = row.type() == TransactionType.INCOME ? "+" : row.type() == TransactionType.EXPENSE ? "−" : "";
            String account = row.toAccount() == null ? row.account() : row.account() + " → " + row.toAccount();
            table.addCell(cell(DATE.format(row.date()), text, Element.ALIGN_LEFT, background));
            table.addCell(cell(ReportData.typeLabel(row.type()), text, Element.ALIGN_LEFT, background));
            table.addCell(cell(row.category(), text, Element.ALIGN_LEFT, background));
            table.addCell(cell(account, text, Element.ALIGN_LEFT, background));
            table.addCell(cell(row.note() == null ? "" : row.note(), text, Element.ALIGN_LEFT, background));
            table.addCell(cell(sign + MoneyFormat.format(row.amount(), currency), font(regular, 8, amountColor), Element.ALIGN_RIGHT, background));
            stripe = !stripe;
        }
        if (data.transactions().isEmpty()) {
            PdfPCell cell = cell("Операцій за обраний період немає", font(regular, 9, MUTED), Element.ALIGN_LEFT, null);
            cell.setColspan(6);
            table.addCell(cell);
        }
        return table;
    }

    private PdfPCell kpiCell(String label, String value, Color color) {
        Paragraph content = new Paragraph();
        content.add(new Chunk(label + "\n", font(regular, 8.5f, MUTED)));
        content.add(new Chunk(value, font(bold, 12.5f, color)));
        PdfPCell cell = new PdfPCell();
        cell.addElement(content);
        cell.setPadding(8);
        cell.setPaddingTop(4);
        cell.setBorderColor(BORDER);
        cell.setBackgroundColor(STRIPE);
        return cell;
    }

    private void section(Document document, PdfWriter writer, String title) throws Exception {
        // заголовок не залишаємо внизу сторінки окремо від таблиці
        if (writer.getVerticalPosition(true) - document.bottom() < 110) {
            document.newPage();
        }
        Paragraph paragraph = new Paragraph(title, font(bold, 12.5f, DARK));
        paragraph.setSpacingBefore(16);
        paragraph.setSpacingAfter(6);
        document.add(paragraph);
    }

    private PdfPTable table(float[] widths) {
        PdfPTable table = new PdfPTable(widths);
        table.setWidthPercentage(100);
        table.setHeaderRows(1);
        return table;
    }

    private void header(PdfPTable table, String... titles) {
        for (String title : titles) {
            PdfPCell cell = new PdfPCell(new Phrase(title, font(bold, 8.5f, Color.WHITE)));
            cell.setBackgroundColor(BRAND);
            cell.setBorderColor(BRAND);
            cell.setPadding(5);
            table.addCell(cell);
        }
    }

    private static PdfPCell cell(String text, Font font, int alignment, Color background) {
        PdfPCell cell = new PdfPCell(new Phrase(text == null ? "" : text, font));
        cell.setHorizontalAlignment(alignment);
        cell.setPadding(4.5f);
        cell.setBorder(Rectangle.BOTTOM);
        cell.setBorderColor(BORDER);
        if (background != null) {
            cell.setBackgroundColor(background);
        }
        return cell;
    }

    private static Font font(BaseFont base, float size, Color color) {
        return new Font(base, size, Font.NORMAL, color);
    }

    private static Color parseColor(String hex) {
        try {
            return new Color(Integer.parseInt(hex.substring(1), 16));
        } catch (RuntimeException e) {
            return MUTED;
        }
    }

    private static BaseFont loadFont(String path) {
        try (InputStream in = new ClassPathResource(path).getInputStream()) {
            byte[] bytes = in.readAllBytes();
            return BaseFont.createFont(path.substring(path.lastIndexOf('/') + 1), BaseFont.IDENTITY_H,
                    BaseFont.EMBEDDED, true, bytes, null);
        } catch (Exception e) {
            throw new IllegalStateException("Cannot load font " + path, e);
        }
    }

    /** Горизонтальна смуга-діаграма частки категорії. */
    private record BarEvent(double fraction, Color color) implements PdfPCellEvent {
        @Override
        public void cellLayout(PdfPCell cell, Rectangle position, PdfContentByte[] canvases) {
            PdfContentByte canvas = canvases[PdfPTable.BACKGROUNDCANVAS];
            float maxWidth = position.getWidth() - 8;
            float width = (float) Math.max(1.5, maxWidth * Math.min(1, fraction));
            canvas.saveState();
            canvas.setColorFill(color);
            canvas.roundRectangle(position.getLeft() + 4, position.getBottom() + 4, width, position.getHeight() - 8, 2);
            canvas.fill();
            canvas.restoreState();
        }
    }

    private class Footer extends PdfPageEventHelper {
        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            Phrase phrase = new Phrase("FinTrack · сторінка " + writer.getPageNumber(), font(regular, 8, MUTED));
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_CENTER, phrase,
                    (document.left() + document.right()) / 2, document.bottom() - 24, 0);
        }
    }

    static boolean supports(BaseFont font, String text) {
        return text.codePoints().allMatch(font::charExists);
    }

    boolean fontSupports(String text) {
        return supports(regular, text) && supports(bold, text);
    }
}
