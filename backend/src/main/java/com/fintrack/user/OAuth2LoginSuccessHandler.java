package com.fintrack.user;

import com.fintrack.common.ApiException;
import com.fintrack.config.AppProperties;
import com.fintrack.user.UserDtos.AuthTokens;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Після успішного входу через Google видає власні токени FinTrack і повертає користувача на SPA.
 * Токени передаються у фрагменті URL (#...), який браузер не надсилає на сервер.
 */
@Component
@RequiredArgsConstructor
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final AuthService authService;
    private final AppProperties props;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request, HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2User principal = (OAuth2User) authentication.getPrincipal();
        String email = principal.getAttribute("email");
        Boolean verified = principal.getAttribute("email_verified");
        String name = principal.getAttribute("name");
        String googleId = principal.getName();
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        try {
            AuthTokens tokens = authService.loginWithGoogle(googleId, email, Boolean.TRUE.equals(verified), name,
                    DeviceNames.resolve(null, request.getHeader(HttpHeaders.USER_AGENT)));
            response.sendRedirect(props.frontendUrl() + "/auth/callback#access=" + encode(tokens.accessToken())
                    + "&refresh=" + encode(tokens.refreshToken()));
        } catch (ApiException e) {
            response.sendRedirect(props.frontendUrl() + "/login?error=" + encode(e.getCode()));
        }
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }
}
