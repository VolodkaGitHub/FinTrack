package com.fintrack.user;

import com.fintrack.user.UserDtos.AuthResponse;
import com.fintrack.user.UserDtos.AuthTokens;
import com.fintrack.user.UserDtos.LoginRequest;
import com.fintrack.user.UserDtos.MessageResponse;
import com.fintrack.user.UserDtos.ProvidersResponse;
import com.fintrack.user.UserDtos.RefreshRequest;
import com.fintrack.user.UserDtos.RegisterRequest;
import com.fintrack.user.UserDtos.ResendVerificationRequest;
import com.fintrack.user.UserDtos.VerifyEmailRequest;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Автентифікація", description = "REQ-4.1")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final TokenService tokenService;
    private final ObjectProvider<ClientRegistrationRepository> oauthRegistrations;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public MessageResponse register(@Valid @RequestBody RegisterRequest request) {
        authService.register(request);
        return new MessageResponse("Ми надіслали лист для підтвердження на " + request.email());
    }

    @PostMapping("/verify-email")
    public AuthResponse verifyEmail(@Valid @RequestBody VerifyEmailRequest request,
                                    @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent) {
        return authService.verifyEmail(request.token(), DeviceNames.resolve(request.deviceName(), userAgent));
    }

    @PostMapping("/resend-verification")
    public MessageResponse resendVerification(@Valid @RequestBody ResendVerificationRequest request) {
        authService.resendVerification(request.email());
        return new MessageResponse("Якщо акаунт існує й не підтверджений, лист надіслано повторно");
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request,
                              @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent) {
        return authService.login(request, DeviceNames.resolve(request.deviceName(), userAgent));
    }

    @PostMapping("/refresh")
    public AuthTokens refresh(@Valid @RequestBody RefreshRequest request) {
        return tokenService.refresh(request.refreshToken());
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@Valid @RequestBody RefreshRequest request) {
        tokenService.revoke(request.refreshToken());
    }

    @GetMapping("/providers")
    public ProvidersResponse providers() {
        return new ProvidersResponse(oauthRegistrations.getIfAvailable() != null);
    }
}
