package com.fintrack.common;

import jakarta.validation.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Перетворення винятків, які не виникають у звичайних сценаріях API, на коректні відповіді. */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void mapsInfrastructureExceptionsToProblemDetails() {
        assertProblem(handler.handleConstraint(new ConstraintViolationException("amount: must be positive", Set.of())),
                HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
        assertProblem(handler.handleOptimisticLock(new ObjectOptimisticLockingFailureException("Transaction", 1L)),
                HttpStatus.CONFLICT, "STALE_DATA");
        assertProblem(handler.handleIntegrity(new DataIntegrityViolationException("duplicate key")),
                HttpStatus.CONFLICT, "CONFLICT");
        assertProblem(handler.handleAccessDenied(new AccessDeniedException("denied")),
                HttpStatus.FORBIDDEN, "FORBIDDEN");
        assertProblem(handler.handleAuthentication(new BadCredentialsException("bad")),
                HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
        ResponseEntity<ProblemDetail> unexpected = handler.handleUnexpected(new IllegalStateException("boom"));
        assertProblem(unexpected, HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR");
        assertThat(unexpected.getBody().getDetail()).doesNotContain("boom");
    }

    @Test
    void apiExceptionFactoriesCarryStatusAndCode() {
        assertThat(ApiException.notFound("x").getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ApiException.badRequest("CODE", "x").getCode()).isEqualTo("CODE");
        assertThat(ApiException.unauthorized("U", "x").getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(ApiException.forbidden("F", "x").getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
        ApiException.checkVersion(null, 5L);
        ApiException.checkVersion(5L, 5L);
        assertThatThrownBy(() -> ApiException.checkVersion(4L, 5L))
                .isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.getCode()).isEqualTo("STALE_DATA"));
    }

    private static void assertProblem(ResponseEntity<ProblemDetail> response, HttpStatus status, String code) {
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().getProperties()).containsEntry("code", code);
    }
}
