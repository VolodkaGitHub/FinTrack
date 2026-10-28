package com.fintrack.user.dataio;

import com.fintrack.common.ApiException;
import com.fintrack.common.CurrentUser;
import com.fintrack.user.dataio.ImportDtos.ImportOptions;
import com.fintrack.user.dataio.ImportDtos.ImportResult;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Clock;
import java.time.LocalDate;

@Tag(name = "Імпорт та експорт", description = "REQ-4.3")
@RestController
@RequestMapping("/api/data")
@RequiredArgsConstructor
public class DataController {

    private static final MediaType CSV = new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8);

    private final CsvExportService exportService;
    private final CsvImportService importService;
    private final Clock clock;

    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@CurrentUser Long userId,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                         @RequestParam(defaultValue = "comma") String delimiter) {
        char separator = switch (delimiter) {
            case "semicolon", ";" -> ';';
            case "tab" -> '\t';
            default -> ',';
        };
        byte[] body = exportService.export(userId, from, to, separator);
        String filename = "fintrack-transactions_" + LocalDate.now(clock) + ".csv";
        return ResponseEntity.ok()
                .contentType(CSV)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .body(body);
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ImportResult importCsv(@CurrentUser Long userId,
                                  @RequestPart("file") MultipartFile file,
                                  @RequestParam(defaultValue = "true") boolean dryRun,
                                  @RequestParam(defaultValue = "true") boolean createMissing,
                                  @RequestParam(defaultValue = "true") boolean skipDuplicates,
                                  @RequestParam(required = false) Long defaultAccountId) {
        try {
            return importService.importCsv(userId, file.getBytes(),
                    new ImportOptions(dryRun, createMissing, skipDuplicates, defaultAccountId));
        } catch (IOException e) {
            throw ApiException.badRequest("Не вдалося прочитати файл");
        }
    }
}
