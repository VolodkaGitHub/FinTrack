package com.fintrack.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class UserDtos {

    private UserDtos() {
    }

    private static final String PASSWORD_RULE = "^(?=.*[A-Za-zА-Яа-яІіЇїЄєҐґ])(?=.*\\d).{8,100}$";
    private static final String PASSWORD_MESSAGE = "Пароль має містити щонайменше 8 символів, літери та цифри";

    public record RegisterRequest(
            @NotBlank(message = "Вкажіть email") @Email(message = "Некоректний email") @Size(max = 255) String email,
            @NotBlank(message = "Вкажіть пароль") @Pattern(regexp = PASSWORD_RULE, message = PASSWORD_MESSAGE) String password,
            @NotBlank(message = "Вкажіть ім'я") @Size(max = 100, message = "Ім'я задовге") String displayName) {
    }

    public record LoginRequest(
            @NotBlank(message = "Вкажіть email") String email,
            @NotBlank(message = "Вкажіть пароль") String password,
            @Size(max = 255) String deviceName) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record VerifyEmailRequest(@NotBlank String token, @Size(max = 255) String deviceName) {
    }

    public record ResendVerificationRequest(@NotBlank @Email String email) {
    }

    public record UpdateProfileRequest(
            @NotBlank(message = "Вкажіть ім'я") @Size(max = 100) String displayName,
            @NotBlank @Pattern(regexp = "^[A-Z]{3}$", message = "Код валюти — 3 латинські літери (ISO 4217)") String currency) {
    }

    public record ChangePasswordRequest(
            String currentPassword,
            @NotBlank @Pattern(regexp = PASSWORD_RULE, message = PASSWORD_MESSAGE) String newPassword) {
    }

    public record UserDto(Long id, String email, String displayName, String currency, User.AuthProvider authProvider,
                          boolean emailVerified, boolean hasPassword, Instant createdAt) {
        public static UserDto from(User user) {
            return new UserDto(user.getId(), user.getEmail(), user.getDisplayName(), user.getCurrency(),
                    user.getAuthProvider(), user.isEmailVerified(), user.getPasswordHash() != null, user.getCreatedAt());
        }
    }

    public record AuthTokens(String accessToken, String refreshToken, long expiresIn) {
    }

    public record AuthResponse(String accessToken, String refreshToken, long expiresIn, UserDto user) {
        public static AuthResponse of(AuthTokens tokens, User user) {
            return new AuthResponse(tokens.accessToken(), tokens.refreshToken(), tokens.expiresIn(), UserDto.from(user));
        }
    }

    public record MessageResponse(String message) {
    }

    public record ProvidersResponse(boolean google) {
    }

    public record SessionDto(Long id, String deviceName, Instant createdAt, Instant lastUsedAt, Instant expiresAt,
                             boolean current) {
    }
}
