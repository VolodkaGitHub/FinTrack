package com.fintrack.user;

import com.fintrack.support.TestProperties;
import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;

import java.util.Map;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** REQ-4.1: лист із посиланням для підтвердження електронної пошти. */
class MailServiceTest {

    private static final String LINK = "http://localhost:5173/verify-email?token=abc123";

    private final JavaMailSender sender = mock(JavaMailSender.class);

    @Test
    void sendsHtmlAndPlainTextLetterWithConfirmationLink() throws Exception {
        when(sender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        service(true).sendVerificationEmail(user(), LINK);

        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(captor.capture());
        MimeMessage message = captor.getValue();
        assertThat(message.getSubject()).isEqualTo("FinTrack — підтвердіть свою електронну пошту");
        assertThat(message.getAllRecipients()[0].toString()).isEqualTo("olena@example.com");
        assertThat(message.getFrom()[0].toString()).contains("no-reply@fintrack.test");
        String content = text(message);
        assertThat(content).contains(LINK).contains("Олена").contains("<a href=");
    }

    @Test
    void sendingFailureDoesNotBreakRegistration() {
        when(sender.createMimeMessage()).thenReturn(new MimeMessage(Session.getInstance(new Properties())));
        doThrow(new MailSendException("SMTP is down")).when(sender).send(any(MimeMessage.class));
        assertThatCode(() -> service(true).sendVerificationEmail(user(), LINK)).doesNotThrowAnyException();
    }

    @Test
    void disabledMailOnlyLogsTheLink() {
        service(false).sendVerificationEmail(user(), LINK);
        verify(sender, never()).send(any(MimeMessage.class));
    }

    private MailService service(boolean enabled) {
        StaticListableBeanFactory beans = new StaticListableBeanFactory(Map.of("mailSender", sender));
        return new MailService(beans.getBeanProvider(JavaMailSender.class), TestProperties.create(enabled));
    }

    private static User user() {
        User user = new User();
        user.setEmail("olena@example.com");
        user.setDisplayName("Олена");
        return user;
    }

    private static String text(Part part) throws Exception {
        Object content = part.getContent();
        if (content instanceof String value) {
            return value;
        }
        StringBuilder result = new StringBuilder();
        if (content instanceof Multipart multipart) {
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart body = multipart.getBodyPart(i);
                result.append(text(body)).append('\n');
            }
        }
        return result.toString();
    }
}
