package com.fintrack.user;

import com.fintrack.config.AppProperties;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.web.util.HtmlUtils;

/** REQ-4.1: лист із підтвердженням пошти. */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailService {

    private final ObjectProvider<JavaMailSender> mailSender;
    private final AppProperties props;

    public void sendVerificationEmail(User user, String link) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (!props.mail().enabled() || sender == null) {
            log.warn("E-mail sending is disabled. Verification link for {}: {}", user.getEmail(), link);
            return;
        }
        try {
            MimeMessage message = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(props.mail().from());
            helper.setTo(user.getEmail());
            helper.setSubject("FinTrack — підтвердіть свою електронну пошту");
            String name = HtmlUtils.htmlEscape(user.getDisplayName());
            String text = """
                    Вітаємо, %s!

                    Дякуємо за реєстрацію у FinTrack. Щоб активувати акаунт, перейдіть за посиланням:
                    %s

                    Посилання дійсне 24 години. Якщо ви не реєструвалися — просто проігноруйте цей лист.
                    """.formatted(user.getDisplayName(), link);
            String html = """
                    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2933">
                      <h2 style="color:#0b7285">FinTrack</h2>
                      <p>Вітаємо, <b>%s</b>!</p>
                      <p>Дякуємо за реєстрацію. Щоб активувати акаунт, підтвердьте свою електронну пошту:</p>
                      <p style="margin:28px 0">
                        <a href="%s" style="background:#0ca678;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none">
                          Підтвердити email
                        </a>
                      </p>
                      <p style="font-size:13px;color:#6b7280">Посилання дійсне 24 години. Якщо ви не реєструвалися у FinTrack — проігноруйте цей лист.</p>
                    </div>
                    """.formatted(name, HtmlUtils.htmlEscape(link));
            helper.setText(text, html);
            sender.send(message);
            log.info("Verification e-mail sent to {}", user.getEmail());
        } catch (Exception e) {
            log.error("Failed to send verification e-mail to {}: {}. Link: {}", user.getEmail(), e.getMessage(), link);
        }
    }
}
