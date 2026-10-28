package com.fintrack.user;

import com.fintrack.common.ApiException;
import com.fintrack.common.CurrentUser;
import com.fintrack.user.UserDtos.ChangePasswordRequest;
import com.fintrack.user.UserDtos.SessionDto;
import com.fintrack.user.UserDtos.UpdateProfileRequest;
import com.fintrack.user.UserDtos.UserDto;
import com.fintrack.user.sync.SyncEvent;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.List;

@Tag(name = "Профіль і пристрої", description = "REQ-4.1, REQ-4.2")
@RestController
@RequestMapping("/api/users/me")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository users;
    private final UserSessionRepository sessions;
    private final TokenService tokenService;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @GetMapping
    @Transactional(readOnly = true)
    public UserDto me(@CurrentUser Long userId) {
        return UserDto.from(load(userId));
    }

    @PutMapping
    @Transactional
    public UserDto update(@CurrentUser Long userId, @Valid @RequestBody UpdateProfileRequest request) {
        User user = load(userId);
        user.setDisplayName(request.displayName().trim());
        user.setCurrency(request.currency());
        events.publishEvent(SyncEvent.of(userId, "user", "updated", userId));
        return UserDto.from(user);
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void changePassword(@CurrentUser Long userId, @Valid @RequestBody ChangePasswordRequest request) {
        User user = load(userId);
        if (user.getPasswordHash() != null
                && (request.currentPassword() == null || !passwordEncoder.matches(request.currentPassword(), user.getPasswordHash()))) {
            throw ApiException.badRequest("BAD_CREDENTIALS", "Поточний пароль введено неправильно");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
    }

    /** Список пристроїв, на яких виконано вхід (REQ-4.2). */
    @GetMapping("/sessions")
    @Transactional(readOnly = true)
    public List<SessionDto> sessions(@CurrentUser Long userId, @AuthenticationPrincipal Jwt jwt) {
        Object sid = jwt.getClaims().get("sid");
        Long currentSessionId = sid instanceof Number number ? number.longValue() : null;
        return sessions.findByUserIdAndRevokedFalseAndExpiresAtAfterOrderByLastUsedAtDesc(userId, clock.instant()).stream()
                .map(s -> new SessionDto(s.getId(), s.getDeviceName(), s.getCreatedAt(), s.getLastUsedAt(),
                        s.getExpiresAt(), s.getId().equals(currentSessionId)))
                .toList();
    }

    @DeleteMapping("/sessions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeSession(@CurrentUser Long userId, @PathVariable Long id) {
        tokenService.revokeSession(userId, id);
    }

    private User load(Long userId) {
        return users.findById(userId).orElseThrow(() -> ApiException.notFound("Користувача не знайдено"));
    }
}
