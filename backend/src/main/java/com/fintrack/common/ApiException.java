package com.fintrack.common;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/** Бізнес-помилка, що перетворюється на RFC 7807 ProblemDetail з машинним кодом для клієнта. */
@Getter
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static ApiException notFound(String message) {
        return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", message);
    }

    public static ApiException badRequest(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

    public static ApiException conflict(String message) {
        return new ApiException(HttpStatus.CONFLICT, "CONFLICT", message);
    }

    public static ApiException unauthorized(String code, String message) {
        return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
    }

    public static ApiException forbidden(String code, String message) {
        return new ApiException(HttpStatus.FORBIDDEN, code, message);
    }

    /** Оптимістичне блокування: запис змінили на іншому пристрої (REQ-4.2). */
    public static ApiException stale() {
        return new ApiException(HttpStatus.CONFLICT, "STALE_DATA",
                "Дані були змінені на іншому пристрої. Оновіть сторінку та спробуйте ще раз.");
    }

    public static void checkVersion(Long expected, Long actual) {
        if (expected != null && !expected.equals(actual)) {
            throw stale();
        }
    }
}
