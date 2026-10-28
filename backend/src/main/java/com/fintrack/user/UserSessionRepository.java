package com.fintrack.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface UserSessionRepository extends JpaRepository<UserSession, Long> {

    Optional<UserSession> findByRefreshTokenHash(String refreshTokenHash);

    Optional<UserSession> findByIdAndUserId(Long id, Long userId);

    List<UserSession> findByUserIdAndRevokedFalseAndExpiresAtAfterOrderByLastUsedAtDesc(Long userId, Instant now);
}
