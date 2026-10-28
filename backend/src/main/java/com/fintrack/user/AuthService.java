package com.fintrack.user;

import com.fintrack.common.ApiException;
import com.fintrack.common.Tokens;
import com.fintrack.config.AppProperties;
import com.fintrack.user.UserDtos.AuthResponse;
import com.fintrack.user.UserDtos.AuthTokens;
import com.fintrack.user.UserDtos.LoginRequest;
import com.fintrack.user.UserDtos.RegisterRequest;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Clock;
import java.time.Instant;
import java.util.Locale;

/** REQ-4.1: реєстрація, підтвердження пошти, вхід за паролем та через Google. */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository users;
    private final EmailVerificationTokenRepository verificationTokens;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokenService;
    private final MailService mailService;
    private final UserDefaultsService userDefaults;
    private final AppProperties props;
    private final MeterRegistry meterRegistry;
    private final Clock clock;

    @Transactional
    public void register(RegisterRequest request) {
        String email = normalize(request.email());
        User user = users.findByEmail(email).orElse(null);
        if (user != null) {
            if (user.isEmailVerified()) {
                throw ApiException.conflict("Користувач з таким email уже зареєстрований");
            }
            // повторна реєстрація до підтвердження пошти — оновлюємо дані й надсилаємо лист ще раз
            user.setPasswordHash(passwordEncoder.encode(request.password()));
            user.setDisplayName(request.displayName().trim());
            sendVerification(user);
            return;
        }
        user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setDisplayName(request.displayName().trim());
        user.setAuthProvider(User.AuthProvider.LOCAL);
        user.setCreatedAt(clock.instant());
        users.save(user);
        userDefaults.createDefaults(user.getId());
        sendVerification(user);
        meterRegistry.counter("fintrack.auth.registrations").increment();
    }

    @Transactional
    public AuthResponse verifyEmail(String token, String deviceName) {
        Instant now = clock.instant();
        EmailVerificationToken verification = verificationTokens.findByTokenHash(Tokens.sha256(token))
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN", "Посилання для підтвердження недійсне"));
        if (verification.getUsedAt() != null) {
            throw ApiException.badRequest("TOKEN_USED", "Пошту вже підтверджено. Увійдіть у свій акаунт.");
        }
        if (verification.getExpiresAt().isBefore(now)) {
            throw ApiException.badRequest("TOKEN_EXPIRED", "Термін дії посилання минув. Надішліть лист повторно.");
        }
        verification.setUsedAt(now);
        User user = users.findById(verification.getUserId())
                .orElseThrow(() -> ApiException.badRequest("INVALID_TOKEN", "Посилання для підтвердження недійсне"));
        user.setEmailVerified(true);
        return AuthResponse.of(tokenService.createSession(user, deviceName), user);
    }

    @Transactional
    public void resendVerification(String email) {
        users.findByEmail(normalize(email))
                .filter(user -> !user.isEmailVerified())
                .ifPresent(this::sendVerification);
    }

    @Transactional
    public AuthResponse login(LoginRequest request, String deviceName) {
        User user = users.findByEmail(normalize(request.email())).orElse(null);
        if (user == null || user.getPasswordHash() == null
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            meterRegistry.counter("fintrack.auth.logins", "result", "failure").increment();
            throw ApiException.unauthorized("BAD_CREDENTIALS", "Невірний email або пароль");
        }
        if (!user.isEmailVerified()) {
            throw ApiException.forbidden("EMAIL_NOT_VERIFIED",
                    "Підтвердіть електронну пошту — ми надіслали лист із посиланням");
        }
        meterRegistry.counter("fintrack.auth.logins", "result", "success").increment();
        return AuthResponse.of(tokenService.createSession(user, deviceName), user);
    }

    /** Google гарантує підтверджену пошту; наявний акаунт з тим самим email прив'язується до Google. */
    @Transactional
    public AuthTokens loginWithGoogle(String googleId, String email, boolean emailVerified, String name, String deviceName) {
        if (!StringUtils.hasText(email) || !emailVerified) {
            throw ApiException.forbidden("EMAIL_NOT_VERIFIED", "Google-акаунт не має підтвердженої електронної пошти");
        }
        User user = users.findByGoogleId(googleId)
                .or(() -> users.findByEmail(normalize(email)))
                .orElse(null);
        if (user == null) {
            user = new User();
            user.setEmail(normalize(email));
            user.setDisplayName(StringUtils.hasText(name) ? name : email.substring(0, email.indexOf('@')));
            user.setAuthProvider(User.AuthProvider.GOOGLE);
            user.setGoogleId(googleId);
            user.setEmailVerified(true);
            user.setCreatedAt(clock.instant());
            users.save(user);
            userDefaults.createDefaults(user.getId());
            meterRegistry.counter("fintrack.auth.registrations").increment();
        } else {
            if (user.getGoogleId() == null) {
                user.setGoogleId(googleId);
            }
            user.setEmailVerified(true);
        }
        meterRegistry.counter("fintrack.auth.logins", "result", "success").increment();
        return tokenService.createSession(user, deviceName);
    }

    private void sendVerification(User user) {
        Instant now = clock.instant();
        verificationTokens.deleteUnusedByUserId(user.getId());
        String token = Tokens.random();
        EmailVerificationToken verification = new EmailVerificationToken();
        verification.setUserId(user.getId());
        verification.setTokenHash(Tokens.sha256(token));
        verification.setCreatedAt(now);
        verification.setExpiresAt(now.plus(props.mail().verificationTtl()));
        verificationTokens.save(verification);
        mailService.sendVerificationEmail(user, props.frontendUrl() + "/verify-email?token=" + token);
    }

    static String normalize(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }
}
