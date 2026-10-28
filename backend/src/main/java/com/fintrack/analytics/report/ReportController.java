package com.fintrack.analytics.report;

import com.fintrack.common.ApiException;
import com.fintrack.common.CurrentUser;
import io.micrometer.core.instrument.MeterRegistry;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Locale;

@Tag(name = "Звіти", description = "REQ-3.3")
@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {

    private static final MediaType XLSX =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final ReportService reportService;
    private final PdfReportGenerator pdfGenerator;
    private final ExcelReportGenerator excelGenerator;
    private final MeterRegistry meterRegistry;

    /** Зведений звіт за період: format = pdf | xlsx. */
    @GetMapping("/summary")
    public ResponseEntity<byte[]> summary(@CurrentUser Long userId,
                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                          @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                          @RequestParam(defaultValue = "pdf") String format) {
        if (from.isAfter(to)) {
            throw ApiException.badRequest("Дата початку періоду пізніша за дату завершення");
        }
        if (from.plusYears(5).isBefore(to)) {
            throw ApiException.badRequest("Звіт можна сформувати максимум за 5 років");
        }
        String extension = format.toLowerCase(Locale.ROOT);
        ReportData data = reportService.collect(userId, from, to);
        byte[] body;
        MediaType mediaType;
        switch (extension) {
            case "pdf" -> {
                body = pdfGenerator.generate(data);
                mediaType = MediaType.APPLICATION_PDF;
            }
            case "xlsx" -> {
                body = excelGenerator.generate(data);
                mediaType = XLSX;
            }
            default -> throw ApiException.badRequest("Підтримуються формати pdf та xlsx");
        }
        meterRegistry.counter("fintrack.reports.generated", "format", extension).increment();
        String filename = "fintrack-report_" + from + "_" + to + "." + extension;
        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .body(body);
    }
}
