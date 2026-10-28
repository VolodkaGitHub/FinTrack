package com.fintrack.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.util.StringUtils;

/**
 * REQ-4.1: вхід через Google OAuth. Вмикається лише тоді, коли задані GOOGLE_CLIENT_ID та GOOGLE_CLIENT_SECRET,
 * тож без них застосунок працює з email/паролем.
 */
@Configuration
@Conditional(GoogleOAuthConfig.GoogleConfigured.class)
public class GoogleOAuthConfig {

    @Bean
    public ClientRegistrationRepository clientRegistrationRepository(AppProperties props) {
        ClientRegistration google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                .clientId(props.oauth2().google().clientId())
                .clientSecret(props.oauth2().google().clientSecret())
                .build();
        return new InMemoryClientRegistrationRepository(google);
    }

    static class GoogleConfigured implements Condition {
        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            return StringUtils.hasText(context.getEnvironment().getProperty("fintrack.oauth2.google.client-id"))
                    && StringUtils.hasText(context.getEnvironment().getProperty("fintrack.oauth2.google.client-secret"));
        }
    }
}
