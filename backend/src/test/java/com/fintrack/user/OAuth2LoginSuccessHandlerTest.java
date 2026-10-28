package com.fintrack.user;

import com.fintrack.common.ApiException;
import com.fintrack.support.TestProperties;
import com.fintrack.user.UserDtos.AuthTokens;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** REQ-4.1: повернення на SPA після входу через Google. */
class OAuth2LoginSuccessHandlerTest {

    private final AuthService authService = mock(AuthService.class);
    private final OAuth2LoginSuccessHandler handler = new OAuth2LoginSuccessHandler(authService, TestProperties.create(false));

    @Test
    void redirectsToSpaWithTokensInUrlFragment() throws Exception {
        when(authService.loginWithGoogle(eq("google-1"), eq("olena@gmail.com"), eq(true), eq("Олена"), eq("Chrome · Android")))
                .thenReturn(new AuthTokens("access+token", "refresh/token", 900));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("User-Agent", "Mozilla/5.0 (Linux; Android 15) Chrome/131.0");
        request.getSession(true);
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(request, response, authentication(true));

        assertThat(response.getRedirectedUrl())
                .isEqualTo("http://localhost:5173/auth/callback#access=access%2Btoken&refresh=refresh%2Ftoken");
        assertThat(request.getSession(false)).isNull();
    }

    @Test
    void redirectsToLoginPageWithErrorCodeWhenLoginIsRejected() throws Exception {
        when(authService.loginWithGoogle(anyString(), anyString(), eq(false), anyString(), anyString()))
                .thenThrow(ApiException.forbidden("EMAIL_NOT_VERIFIED", "Пошту не підтверджено"));
        MockHttpServletResponse response = new MockHttpServletResponse();

        handler.onAuthenticationSuccess(new MockHttpServletRequest(), response, authentication(false));

        assertThat(response.getRedirectedUrl()).isEqualTo("http://localhost:5173/login?error=EMAIL_NOT_VERIFIED");
    }

    private static TestingAuthenticationToken authentication(boolean emailVerified) {
        DefaultOAuth2User principal = new DefaultOAuth2User(List.of(new SimpleGrantedAuthority("OAUTH2_USER")),
                Map.of("sub", "google-1", "email", "olena@gmail.com", "email_verified", emailVerified, "name", "Олена"),
                "sub");
        return new TestingAuthenticationToken(principal, null);
    }
}
