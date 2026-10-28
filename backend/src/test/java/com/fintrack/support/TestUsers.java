package com.fintrack.support;

import com.fintrack.user.TokenService;
import com.fintrack.user.User;
import com.fintrack.user.UserDefaultsService;
import com.fintrack.user.UserDtos.AuthTokens;
import com.fintrack.user.UserRepository;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/** Створює підтвердженого користувача з типовими рахунками й категоріями та видає йому токени. */
@Component
public class TestUsers {

    private final UserRepository users;
    private final UserDefaultsService defaults;
    private final TokenService tokens;

    public TestUsers(UserRepository users, UserDefaultsService defaults, TokenService tokens) {
        this.users = users;
        this.defaults = defaults;
        this.tokens = tokens;
    }

    public record TestUser(Long id, String email, String accessToken) {
        public String bearer() {
            return "Bearer " + accessToken;
        }
    }

    public TestUser create() {
        User user = new User();
        user.setEmail("user-" + UUID.randomUUID() + "@test.local");
        user.setDisplayName("Тестовий користувач");
        user.setEmailVerified(true);
        user.setCreatedAt(Instant.now());
        users.save(user);
        defaults.createDefaults(user.getId());
        AuthTokens issued = tokens.createSession(user, "JUnit");
        return new TestUser(user.getId(), user.getEmail(), issued.accessToken());
    }
}
