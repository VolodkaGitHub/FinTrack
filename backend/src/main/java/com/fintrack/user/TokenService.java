package com.fintrack.user;

import com.fintrack.common.ApiException;
import com.fintrack.common.Tokens;
import com.fintrack.config.AppProperties;
import com.fintrack.user.UserDtos.AuthTokens;
import com.fintrack.user.sync.SyncEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;

/** Видача JWT access-токенів і керування refresh-сесіями пристроїв. */
@Service
@RequiredArgsConstructor
public class TokenService {

    private final JwtEncoder jwtEncoder;
    private final AppProperties props;
    private final UserSessionRepository sessions;
    private final UserRepository users;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Transactional
    public AuthTokens createSession(User user, String deviceName) {
        Instant now = clock.instant();
        String refreshToken = Tokens.random();
        UserSession session = new UserSession();
        session.setUserId(user.getId());
        session.setRefreshTokenHash(Tokens.sha256(refreshToken));
        session.setDeviceName(deviceName);
        session.setCreatedAt(now);
        session.setLastUsedAt(now);
        session.setExpiresAt(now.plus(props.jwt().refreshTokenTtl()));
        sessions.save(session);
        return new AuthTokens(accessToken(user, session.getId()), refreshToken, props.jwt().accessTokenTtl().toSeconds());
    }

    /** Ротація refresh-токена: старий стає недійсним, сесія пристрою зберігається. */
    @Transactional
    public AuthTokens refresh(String refreshToken) {
        Instant now = clock.instant();
        UserSession session = sessions.findByRefreshTokenHash(Tokens.sha256(refreshToken))
                .filter(s -> !s.isRevoked() && s.getExpiresAt().isAfter(now))
                .orElseThrow(() -> ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Сесія завершилась. Увійдіть знову."));
        User user = users.findById(session.getUserId())
                .orElseThrow(() -> ApiException.unauthorized("INVALID_REFRESH_TOKEN", "Сесія завершилась. Увійдіть знову."));
        String newRefreshToken = Tokens.random();
        session.setRefreshTokenHash(Tokens.sha256(newRefreshToken));
        session.setLastUsedAt(now);
        session.setExpiresAt(now.plus(props.jwt().refreshTokenTtl()));
        return new AuthTokens(accessToken(user, session.getId()), newRefreshToken, props.jwt().accessTokenTtl().toSeconds());
    }

    @Transactional
    public void revoke(String refreshToken) {
        sessions.findByRefreshTokenHash(Tokens.sha256(refreshToken)).ifPresent(this::revokeSession);
    }

    @Transactional
    public void revokeSession(Long userId, Long sessionId) {
        UserSession session = sessions.findByIdAndUserId(sessionId, userId)
                .orElseThrow(() -> ApiException.notFound("Сесію не знайдено"));
        revokeSession(session);
    }

    private void revokeSession(UserSession session) {
        session.setRevoked(true);
        // пристрій із цією сесією отримає подію й виконає вихід
        events.publishEvent(SyncEvent.of(session.getUserId(), "session", "revoked", session.getId()));
    }

    private String accessToken(User user, Long sessionId) {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("fintrack")
                .issuedAt(now)
                .expiresAt(now.plus(props.jwt().accessTokenTtl()))
                .subject(String.valueOf(user.getId()))
                .claim("email", user.getEmail())
                .claim("name", user.getDisplayName())
                .claim("sid", sessionId)
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
